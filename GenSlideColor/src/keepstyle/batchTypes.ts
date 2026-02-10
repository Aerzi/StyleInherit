/**
 * ============================================
 * 批量处理类型定义
 * ============================================
 * 
 * 用途：定义批量样张生成的数据结构
 * 支持：
 * - 从 Excel 表格提取任务
 * - 任务队列管理
 * - 断点续传（锁屏恢复）
 * - 结果持久化
 */

// 提示词模式（与 types.ts 保持一致）
export type BatchPromptMode = 'text' | 'style_extract' | 'image_reference';

/**
 * 单个批量任务项
 */
export interface BatchTaskItem {
  id: string;                          // 任务唯一标识
  index: number;                       // 任务序号（从1开始）
  theme: string;                       // 主题文字（用户输入）
  referenceImageBase64: string;        // 参考图片（Base64）
  referenceImageName?: string;         // 图片名称（可选）
  
  // 任务状态
  status: BatchTaskStatus;
  progress: number;                    // 进度 0-100
  
  // 生成结果
  result?: BatchTaskResult;
  
  // 时间戳
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  
  // 错误信息
  error?: string;
  retryCount: number;                  // 重试次数
}

/**
 * 任务状态枚举
 */
export type BatchTaskStatus = 
  | 'pending'      // 等待中
  | 'extracting'   // 正在提取样式
  | 'generating'   // 正在生成
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'cancelled';   // 已取消

/**
 * 单个任务的结果
 */
export interface BatchTaskResult {
  styleDescription?: string;           // 提取的样式描述
  html?: string;                       // 生成的 HTML
  imageUrl?: string;                   // 生成的图片 URL
  generatedAt: number;                 // 生成时间戳
}

/**
 * 批量任务配置
 */
export interface BatchConfig {
  enableStyleExtract: boolean;         // 是否启用样式提取
  outputType: 'html' | 'image' | 'both'; // 输出类型
  promptMode: BatchPromptMode;         // 提示词模式
  imageModel: string;                  // 图片生成模型
  htmlTemplateId?: number | string;    // HTML 模板 ID
  htmlTemplateContent?: string;        // HTML 模板内容
  
  // 并发配置
  concurrency: number;                 // 并发数（默认1，避免接口限流）
  retryLimit: number;                  // 重试次数限制
  retryDelay: number;                  // 重试延迟（毫秒）
  
  // 间隔配置（避免请求过快）
  taskInterval: number;                // 任务间隔（毫秒）
}

/**
 * 批量任务会话
 */
export interface BatchSession {
  id: string;                          // 会话 ID
  name: string;                        // 会话名称（Excel 文件名）
  config: BatchConfig;                 // 配置
  tasks: BatchTaskItem[];              // 任务列表
  
  // 会话状态
  status: BatchSessionStatus;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  
  // 时间戳
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  completedAt?: number;
  
  // 当前执行位置（用于断点续传）
  currentTaskIndex: number;
}

/**
 * 会话状态枚举
 */
export type BatchSessionStatus = 
  | 'created'      // 已创建（未开始）
  | 'running'      // 运行中
  | 'paused'       // 已暂停
  | 'completed'    // 已完成
  | 'cancelled';   // 已取消

/**
 * Excel 解析结果
 */
export interface ExcelParseResult {
  success: boolean;
  fileName: string;
  items: ExcelRowItem[];
  errors?: string[];
}

/**
 * Excel 行数据
 */
export interface ExcelRowItem {
  rowIndex: number;                    // 行号
  theme: string;                       // 主题文字（兼容）
  userPrompt?: string;                 // 用户输入/主题（Excel 解析器使用）
  imageBase64: string;                 // 图片 Base64
  imageName?: string;                  // 图片名称
}

/**
 * 批量处理进度回调
 */
export interface BatchProgressCallbacks {
  onTaskStart?: (task: BatchTaskItem) => void;
  onTaskProgress?: (task: BatchTaskItem, progress: number) => void;
  onTaskComplete?: (task: BatchTaskItem) => void;
  onTaskError?: (task: BatchTaskItem, error: string) => void;
  onSessionProgress?: (session: BatchSession) => void;
  onSessionComplete?: (session: BatchSession) => void;
  onSessionPaused?: (session: BatchSession) => void;
}

/**
 * localStorage 存储键
 */
export const BATCH_STORAGE_KEYS = {
  SESSIONS: 'batch_sessions',          // 所有会话列表
  CURRENT_SESSION: 'batch_current_session', // 当前活跃会话
  RESULTS: 'batch_results',            // 所有结果
  // 兼容旧代码
  JOB_PREFIX: 'batch_job_',            // 任务前缀
  CURRENT_JOB_ID: 'batch_current_job', // 当前任务ID
} as const;

/**
 * 默认配置
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  enableStyleExtract: true,
  outputType: 'both',
  promptMode: 'style_extract',
  imageModel: 'Doubao-image-seedream-v4.5',
  concurrency: 1,
  retryLimit: 3,
  retryDelay: 5000,
  taskInterval: 2000,
};

// ============================================
// 兼容性类型别名（为旧代码提供向后兼容）
// ============================================

/** @deprecated 使用 BatchSession 代替 */
export type BatchJob = BatchSession;

/** @deprecated 使用 BatchConfig 代替 */
export type BatchTaskConfig = BatchConfig;

/** @deprecated 使用 BatchProgressCallbacks 代替 */
export type BatchJobCallbacks = BatchProgressCallbacks;

/** 解析后的 Excel 行（与 ExcelRowItem 结构一致，保留命名供解析器使用） */
export interface ExcelParsedItem extends ExcelRowItem {}
