/**
 * ============================================
 * 批量处理服务
 * ============================================
 * 
 * 核心功能：
 * - 任务队列管理
 * - 断点续传（锁屏恢复）
 * - 结果持久化到 localStorage
 * - 进度回调
 */

import type {
  BatchSession,
  BatchTaskItem,
  BatchTaskStatus,
  BatchConfig,
  BatchProgressCallbacks,
  ExcelRowItem,
} from './batchTypes';
import { BATCH_STORAGE_KEYS, DEFAULT_BATCH_CONFIG } from './batchTypes';
import { extractStyleFromImage } from './extractStyleService';
import { generateSlide } from './generateService';

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 批量处理服务类
 */
export class BatchProcessor {
  private session: BatchSession | null = null;
  private isRunning = false;
  private isPaused = false;
  private callbacks: BatchProgressCallbacks = {};
  private abortController: AbortController | null = null;

  constructor() {
    // 尝试恢复上次未完成的会话
    this.tryResumeSession();
  }

  /**
   * 创建新的批量会话
   */
  createSession(
    name: string,
    items: ExcelRowItem[],
    config: Partial<BatchConfig> = {}
  ): BatchSession {
    const fullConfig: BatchConfig = { ...DEFAULT_BATCH_CONFIG, ...config };

    const tasks: BatchTaskItem[] = items.map((item, index) => ({
      id: generateId(),
      index: index + 1,
      theme: item.theme,
      referenceImageBase64: item.imageBase64,
      referenceImageName: item.imageName,
      status: 'pending' as BatchTaskStatus,
      progress: 0,
      createdAt: Date.now(),
      retryCount: 0,
    }));

    this.session = {
      id: generateId(),
      name,
      config: fullConfig,
      tasks,
      status: 'created',
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      createdAt: Date.now(),
      currentTaskIndex: 0,
    };

    this.saveSession();
    return this.session;
  }

  /**
   * 开始执行批量任务
   */
  async start(callbacks?: BatchProgressCallbacks): Promise<void> {
    if (!this.session) {
      throw new Error('没有活跃的批量会话');
    }

    if (this.isRunning) {
      console.warn('批量任务已在运行中');
      return;
    }

    this.callbacks = callbacks || {};
    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();

    this.session.status = 'running';
    this.session.startedAt = this.session.startedAt || Date.now();
    this.saveSession();

    try {
      await this.runTasks();
    } catch (error) {
      console.error('批量处理出错:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 暂停执行
   */
  pause(): void {
    if (!this.isRunning || !this.session) return;

    this.isPaused = true;
    this.session.status = 'paused';
    this.session.pausedAt = Date.now();
    this.saveSession();

    this.callbacks.onSessionPaused?.(this.session);
  }

  /**
   * 恢复执行
   */
  async resume(callbacks?: BatchProgressCallbacks): Promise<void> {
    if (!this.session || this.session.status !== 'paused') {
      throw new Error('没有可恢复的会话');
    }

    this.callbacks = callbacks || this.callbacks;
    await this.start(this.callbacks);
  }

  /**
   * 取消执行
   */
  cancel(): void {
    if (!this.session) return;

    this.isPaused = true;
    this.isRunning = false;
    this.abortController?.abort();

    this.session.status = 'cancelled';
    
    // 将所有 pending 和 running 状态的任务标记为 cancelled
    this.session.tasks.forEach(task => {
      if (task.status === 'pending' || task.status === 'extracting' || task.status === 'generating') {
        task.status = 'cancelled';
      }
    });

    this.saveSession();
  }

  /**
   * 获取当前会话
   */
  getSession(): BatchSession | null {
    return this.session;
  }

  /**
   * 获取所有历史会话
   */
  getAllSessions(): BatchSession[] {
    try {
      const data = localStorage.getItem(BATCH_STORAGE_KEYS.SESSIONS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * 加载指定会话
   */
  loadSession(sessionId: string): BatchSession | null {
    const sessions = this.getAllSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      this.session = session;
    }
    return session || null;
  }

  /**
   * 删除会话
   */
  deleteSession(sessionId: string): void {
    const sessions = this.getAllSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    localStorage.setItem(BATCH_STORAGE_KEYS.SESSIONS, JSON.stringify(filtered));

    if (this.session?.id === sessionId) {
      this.session = null;
    }
  }

  /**
   * 清空所有会话
   */
  clearAllSessions(): void {
    localStorage.removeItem(BATCH_STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(BATCH_STORAGE_KEYS.CURRENT_SESSION);
    this.session = null;
  }

  /**
   * 导出结果为 JSON
   */
  exportResults(): string {
    if (!this.session) return '{}';

    const results = this.session.tasks
      .filter(t => t.status === 'completed' && t.result)
      .map(t => ({
        index: t.index,
        theme: t.theme,
        imageName: t.referenceImageName,
        result: t.result,
      }));

    return JSON.stringify(results, null, 2);
  }

  /**
   * 运行任务队列
   */
  private async runTasks(): Promise<void> {
    if (!this.session) return;

    const { tasks, config, currentTaskIndex } = this.session;
    
    for (let i = currentTaskIndex; i < tasks.length; i++) {
      // 检查是否暂停或取消
      if (this.isPaused || this.abortController?.signal.aborted) {
        break;
      }

      const task = tasks[i];
      
      // 跳过已完成或已取消的任务
      if (task.status === 'completed' || task.status === 'cancelled') {
        continue;
      }

      // 更新当前任务索引
      this.session.currentTaskIndex = i;
      this.saveSession();

      // 执行单个任务
      await this.runSingleTask(task);

      // 任务间隔
      if (i < tasks.length - 1 && config.taskInterval > 0) {
        await this.delay(config.taskInterval);
      }
    }

    // 检查是否全部完成
    if (!this.isPaused && this.session) {
      const allCompleted = this.session.tasks.every(
        t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled'
      );

      if (allCompleted) {
        this.session.status = 'completed';
        this.session.completedAt = Date.now();
        this.saveSession();
        this.callbacks.onSessionComplete?.(this.session);
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async runSingleTask(task: BatchTaskItem): Promise<void> {
    if (!this.session) return;

    const { config } = this.session;

    try {
      task.status = 'extracting';
      task.startedAt = Date.now();
      task.progress = 0;
      this.callbacks.onTaskStart?.(task);
      this.saveSession();

      let styleDescription = '';

      // 阶段1: 样式提取（如果启用）
      if (config.enableStyleExtract) {
        task.progress = 10;
        this.callbacks.onTaskProgress?.(task, 10);

        const extractResult = await extractStyleFromImage({
          imageBase64s: [task.referenceImageBase64],
        });

        styleDescription = extractResult.styleDescription;
        task.progress = 40;
        this.callbacks.onTaskProgress?.(task, 40);
      }

      // 阶段2: 生成内容
      task.status = 'generating';
      this.saveSession();

      const generateResult = await generateSlide({
        styleDescription,
        userPrompt: task.theme,
        outputType: config.outputType,
        imageModel: config.imageModel,
        promptMode: config.promptMode,
        imageBase64s: [task.referenceImageBase64],
        htmlTemplate: config.htmlTemplateContent,
      });

      task.progress = 90;
      this.callbacks.onTaskProgress?.(task, 90);

      if (!generateResult.success) {
        throw new Error(generateResult.error || '生成失败');
      }

      // 保存结果
      task.result = {
        styleDescription,
        html: generateResult.html,
        imageUrl: generateResult.imageUrl,
        generatedAt: Date.now(),
      };

      task.status = 'completed';
      task.progress = 100;
      task.completedAt = Date.now();
      
      this.session.completedTasks++;
      this.callbacks.onTaskComplete?.(task);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      
      task.retryCount++;
      
      // 检查是否需要重试
      if (task.retryCount < config.retryLimit) {
        console.log(`任务 ${task.index} 失败，将在 ${config.retryDelay}ms 后重试 (${task.retryCount}/${config.retryLimit})`);
        task.status = 'pending';
        task.error = `重试中: ${errorMessage}`;
        this.saveSession();
        
        await this.delay(config.retryDelay);
        await this.runSingleTask(task);
        return;
      }

      // 重试次数用尽，标记为失败
      task.status = 'failed';
      task.error = errorMessage;
      task.completedAt = Date.now();
      
      this.session.failedTasks++;
      this.callbacks.onTaskError?.(task, errorMessage);
    }

    this.saveSession();
    this.callbacks.onSessionProgress?.(this.session);
  }

  /**
   * 保存会话到 localStorage
   */
  private saveSession(): void {
    if (!this.session) return;

    try {
      // 保存当前会话
      localStorage.setItem(
        BATCH_STORAGE_KEYS.CURRENT_SESSION,
        JSON.stringify(this.session)
      );

      // 更新会话列表
      const sessions = this.getAllSessions();
      const index = sessions.findIndex(s => s.id === this.session!.id);
      
      if (index >= 0) {
        sessions[index] = this.session;
      } else {
        sessions.unshift(this.session);
      }

      // 只保留最近 20 个会话
      const trimmed = sessions.slice(0, 20);
      localStorage.setItem(BATCH_STORAGE_KEYS.SESSIONS, JSON.stringify(trimmed));
    } catch (error) {
      console.error('保存会话失败:', error);
    }
  }

  /**
   * 尝试恢复上次未完成的会话
   */
  private tryResumeSession(): void {
    try {
      const data = localStorage.getItem(BATCH_STORAGE_KEYS.CURRENT_SESSION);
      if (data) {
        const session = JSON.parse(data) as BatchSession;
        
        // 只恢复 running 或 paused 状态的会话
        if (session.status === 'running' || session.status === 'paused') {
          session.status = 'paused'; // 标记为暂停状态
          this.session = session;
          console.log('检测到未完成的批量会话，已恢复');
        }
      }
    } catch (error) {
      console.warn('恢复会话失败:', error);
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查是否有未完成的会话
   */
  hasUnfinishedSession(): boolean {
    return this.session !== null && 
           (this.session.status === 'running' || this.session.status === 'paused');
  }

  /**
   * 获取运行状态
   */
  isProcessing(): boolean {
    return this.isRunning;
  }
}

// 导出单例实例
export const batchProcessor = new BatchProcessor();

