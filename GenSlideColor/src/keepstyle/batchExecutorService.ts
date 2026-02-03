/**
 * ============================================
 * 批量任务执行引擎
 * ============================================
 * 
 * 用途：管理批量任务的执行、暂停、恢复
 * 特性：
 * - 支持断点续传（锁屏后继续运行）
 * - 任务进度持久化
 * - 失败重试机制
 * - 请求间隔控制（避免限流）
 */

import {
  BatchJob,
  BatchTaskItem,
  BatchTaskConfig,
  BatchJobCallbacks,
  ExcelParsedItem,
} from './batchTypes';
import {
  saveBatchJob,
  loadBatchJob,
  setCurrentJobId,
  updateTaskInJob,
  updateJobStatus,
} from './batchStorageService';
import { extractStyleFromImage } from './extractStyleService';
import { generateSlide } from './generateService';
import { loadTemplateById } from '../assets/template/templateLoader';

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 批量执行器类
 */
export class BatchExecutor {
  private currentJob: BatchJob | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private callbacks: BatchJobCallbacks = {};
  private abortController: AbortController | null = null;

  /**
   * 创建新的批量任务
   */
  async createJob(
    name: string,
    parsedItems: ExcelParsedItem[],
    config: BatchTaskConfig
  ): Promise<BatchJob> {
    // 如果配置了模板，预加载模板内容
    let templateContent = '';
    if (config.htmlTemplateId) {
      try {
        templateContent = await loadTemplateById(config.htmlTemplateId) || '';
      } catch (error) {
        console.warn('加载模板失败:', error);
      }
    }
    config.htmlTemplateContent = templateContent;

    // 创建任务列表
    const tasks: BatchTaskItem[] = parsedItems.map((item, index) => ({
      id: generateId(),
      index: item.rowIndex,
      referenceImageBase64: item.imageBase64,
      userPrompt: item.userPrompt,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    }));

    // 创建任务批次
    const job: BatchJob = {
      id: generateId(),
      name,
      config,
      tasks,
      status: 'idle',
      totalCount: tasks.length,
      completedCount: 0,
      failedCount: 0,
      createdAt: Date.now(),
      currentIndex: 0,
    };

    // 保存到 localStorage
    saveBatchJob(job);
    setCurrentJobId(job.id);

    this.currentJob = job;
    return job;
  }

  /**
   * 恢复已有任务
   */
  resumeJob(jobId: string): BatchJob | null {
    const job = loadBatchJob(jobId);
    if (job) {
      this.currentJob = job;
      setCurrentJobId(job.id);
    }
    return job;
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: BatchJobCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 开始执行
   */
  async start(): Promise<void> {
    if (!this.currentJob) {
      throw new Error('没有当前任务');
    }

    if (this.isRunning) {
      console.warn('任务已在运行中');
      return;
    }

    this.isRunning = true;
    this.isPaused = false;
    this.abortController = new AbortController();

    // 更新状态
    this.currentJob.status = 'running';
    this.currentJob.startedAt = this.currentJob.startedAt || Date.now();
    saveBatchJob(this.currentJob);

    // 开始执行任务
    await this.executeLoop();
  }

  /**
   * 暂停执行
   */
  pause(): void {
    if (!this.isRunning) return;

    this.isPaused = true;
    this.isRunning = false;

    if (this.currentJob) {
      this.currentJob.status = 'paused';
      this.currentJob.pausedAt = Date.now();
      saveBatchJob(this.currentJob);
      this.callbacks.onJobPaused?.(this.currentJob);
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.isPaused = false;
    this.isRunning = false;
    this.abortController?.abort();

    if (this.currentJob) {
      this.currentJob.status = 'cancelled';
      saveBatchJob(this.currentJob);
    }
  }

  /**
   * 获取当前任务
   */
  getCurrentJob(): BatchJob | null {
    return this.currentJob;
  }

  /**
   * 获取运行状态
   */
  getStatus(): { isRunning: boolean; isPaused: boolean } {
    return { isRunning: this.isRunning, isPaused: this.isPaused };
  }

  /**
   * 主执行循环
   */
  private async executeLoop(): Promise<void> {
    if (!this.currentJob) return;

    const { tasks, config, currentIndex } = this.currentJob;

    // 从断点位置继续
    for (let i = currentIndex; i < tasks.length; i++) {
      // 检查是否暂停或取消
      if (this.isPaused || !this.isRunning) {
        return;
      }

      const task = tasks[i];

      // 跳过已完成的任务
      if (task.status === 'completed') {
        continue;
      }

      // 更新当前索引
      this.currentJob.currentIndex = i;
      saveBatchJob(this.currentJob);

      // 执行单个任务（带重试）
      await this.executeTaskWithRetry(task, config.retryCount);

      // 更新进度
      this.currentJob.completedCount = tasks.filter(t => t.status === 'completed').length;
      this.currentJob.failedCount = tasks.filter(t => t.status === 'failed').length;
      saveBatchJob(this.currentJob);
      this.callbacks.onJobProgress?.(this.currentJob);

      // 任务间隔
      if (i < tasks.length - 1 && config.taskDelay > 0) {
        await delay(config.taskDelay);
      }
    }

    // 全部完成
    if (this.isRunning) {
      this.currentJob.status = 'completed';
      this.currentJob.completedAt = Date.now();
      saveBatchJob(this.currentJob);
      this.callbacks.onJobComplete?.(this.currentJob);
      this.isRunning = false;
    }
  }

  /**
   * 执行单个任务（带重试）
   */
  private async executeTaskWithRetry(task: BatchTaskItem, retryCount: number): Promise<void> {
    let attempts = 0;
    
    while (attempts <= retryCount) {
      try {
        await this.executeTask(task);
        return;
      } catch (error) {
        attempts++;
        const errMsg = error instanceof Error ? error.message : String(error);
        
        if (attempts > retryCount) {
          // 最终失败
          task.status = 'failed';
          task.error = errMsg;
          task.completedAt = Date.now();
          updateTaskInJob(this.currentJob!.id, task);
          this.callbacks.onTaskError?.(task, errMsg);
        } else {
          // 等待后重试
          console.log(`任务 ${task.index} 失败，第 ${attempts} 次重试...`);
          await delay(2000 * attempts); // 指数退避
        }
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: BatchTaskItem): Promise<void> {
    if (!this.currentJob) return;

    const config = this.currentJob.config;
    
    // 通知开始
    task.startedAt = Date.now();
    this.callbacks.onTaskStart?.(task);

    // 阶段1: 样式提取（如果启用）
    if (config.enableStyleExtract) {
      task.status = 'extracting';
      task.progress = 10;
      updateTaskInJob(this.currentJob.id, task);
      this.callbacks.onTaskProgress?.(task, 10);

      const extractResult = await extractStyleFromImage({
        imageBase64s: [task.referenceImageBase64],
      });

      task.extractedStyle = extractResult.styleDescription;
      task.progress = 40;
      updateTaskInJob(this.currentJob.id, task);
      this.callbacks.onTaskProgress?.(task, 40);
    } else {
      task.progress = 40;
    }

    // 阶段2: 生成内容
    const needHtml = config.outputType === 'html' || config.outputType === 'both';
    const needImage = config.outputType === 'image' || config.outputType === 'both';

    if (needHtml) {
      task.status = 'generating_html';
      updateTaskInJob(this.currentJob.id, task);

      const htmlResult = await generateSlide({
        styleDescription: task.extractedStyle || '',
        userPrompt: task.userPrompt,
        outputType: 'html',
        promptMode: config.enableStyleExtract ? 'style_extract' : 'image_reference',
        htmlTemplate: config.htmlTemplateContent,
        imageBase64s: [task.referenceImageBase64],
        width: config.width,
        height: config.height,
      });

      if (htmlResult.success && htmlResult.html) {
        task.generatedHtml = htmlResult.html;
      } else {
        throw new Error(htmlResult.error || 'HTML 生成失败');
      }

      task.progress = needImage ? 70 : 95;
      updateTaskInJob(this.currentJob.id, task);
      this.callbacks.onTaskProgress?.(task, task.progress);
    }

    if (needImage) {
      task.status = 'generating_image';
      updateTaskInJob(this.currentJob.id, task);

      const imageResult = await generateSlide({
        styleDescription: task.extractedStyle || '',
        userPrompt: task.userPrompt,
        outputType: 'image',
        promptMode: config.enableStyleExtract ? 'style_extract' : 'image_reference',
        imageModel: config.imageModel,
        imageSize: config.imageSize,
        imageBase64s: [task.referenceImageBase64],
        width: config.width,
        height: config.height,
      });

      if (imageResult.success && imageResult.imageUrl) {
        task.generatedImageUrl = imageResult.imageUrl;
      } else {
        throw new Error(imageResult.error || '图片生成失败');
      }

      task.progress = 95;
      updateTaskInJob(this.currentJob.id, task);
      this.callbacks.onTaskProgress?.(task, 95);
    }

    // 完成
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = Date.now();
    updateTaskInJob(this.currentJob.id, task);
    this.callbacks.onTaskComplete?.(task);
  }

  /**
   * 重试失败的任务
   */
  async retryFailed(): Promise<void> {
    if (!this.currentJob) return;

    // 重置失败任务状态
    for (const task of this.currentJob.tasks) {
      if (task.status === 'failed') {
        task.status = 'pending';
        task.progress = 0;
        task.error = undefined;
        updateTaskInJob(this.currentJob.id, task);
      }
    }

    // 找到第一个待处理的任务
    const firstPendingIndex = this.currentJob.tasks.findIndex(t => t.status === 'pending');
    if (firstPendingIndex >= 0) {
      this.currentJob.currentIndex = firstPendingIndex;
      saveBatchJob(this.currentJob);
    }

    // 重新开始
    await this.start();
  }
}

// 导出单例
export const batchExecutor = new BatchExecutor();

