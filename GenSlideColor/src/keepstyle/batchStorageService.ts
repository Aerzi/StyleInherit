/**
 * ============================================
 * 批量任务存储服务
 * ============================================
 * 
 * 用途：管理批量任务的持久化存储
 * 存储位置：localStorage
 * 支持断点续传
 */

import { BatchJob, BatchTaskItem, BATCH_STORAGE_KEYS } from './batchTypes';

/**
 * 保存批量任务
 */
export function saveBatchJob(job: BatchJob): void {
  try {
    const key = `${BATCH_STORAGE_KEYS.JOB_PREFIX}${job.id}`;
    localStorage.setItem(key, JSON.stringify(job));
    
    // 更新任务列表索引
    updateJobIndex(job.id, job.name, job.createdAt);
  } catch (error) {
    console.error('保存批量任务失败:', error);
    // 如果localStorage满了，尝试清理旧数据
    cleanOldJobs();
  }
}

/**
 * 加载批量任务
 */
export function loadBatchJob(jobId: string): BatchJob | null {
  try {
    const key = `${BATCH_STORAGE_KEYS.JOB_PREFIX}${jobId}`;
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data) as BatchJob;
    }
  } catch (error) {
    console.error('加载批量任务失败:', error);
  }
  return null;
}

/**
 * 删除批量任务
 */
export function deleteBatchJob(jobId: string): void {
  try {
    const key = `${BATCH_STORAGE_KEYS.JOB_PREFIX}${jobId}`;
    localStorage.removeItem(key);
    
    // 从索引中移除
    removeFromJobIndex(jobId);
  } catch (error) {
    console.error('删除批量任务失败:', error);
  }
}

/**
 * 获取所有批量任务列表（仅索引信息）
 */
export function getBatchJobList(): { id: string; name: string; createdAt: number }[] {
  try {
    const data = localStorage.getItem(BATCH_STORAGE_KEYS.JOB_LIST);
    if (data) {
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('获取批量任务列表失败:', error);
  }
  return [];
}

/**
 * 更新任务列表索引
 */
function updateJobIndex(id: string, name: string, createdAt: number): void {
  const list = getBatchJobList();
  const existingIndex = list.findIndex(item => item.id === id);
  
  if (existingIndex >= 0) {
    list[existingIndex] = { id, name, createdAt };
  } else {
    list.unshift({ id, name, createdAt });
  }
  
  // 保留最近20个任务
  const trimmedList = list.slice(0, 20);
  localStorage.setItem(BATCH_STORAGE_KEYS.JOB_LIST, JSON.stringify(trimmedList));
}

/**
 * 从索引中移除
 */
function removeFromJobIndex(id: string): void {
  const list = getBatchJobList();
  const filteredList = list.filter(item => item.id !== id);
  localStorage.setItem(BATCH_STORAGE_KEYS.JOB_LIST, JSON.stringify(filteredList));
}

/**
 * 清理旧任务（保留最近10个）
 */
function cleanOldJobs(): void {
  const list = getBatchJobList();
  
  // 按时间排序，删除最旧的任务
  const sortedList = list.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = sortedList.slice(10);
  
  for (const item of toDelete) {
    deleteBatchJob(item.id);
  }
}

/**
 * 保存当前任务ID
 */
export function setCurrentJobId(jobId: string | null): void {
  if (jobId) {
    localStorage.setItem(BATCH_STORAGE_KEYS.CURRENT_JOB, jobId);
  } else {
    localStorage.removeItem(BATCH_STORAGE_KEYS.CURRENT_JOB);
  }
}

/**
 * 获取当前任务ID
 */
export function getCurrentJobId(): string | null {
  return localStorage.getItem(BATCH_STORAGE_KEYS.CURRENT_JOB);
}

/**
 * 更新单个任务项
 */
export function updateTaskInJob(jobId: string, task: BatchTaskItem): void {
  const job = loadBatchJob(jobId);
  if (job) {
    const taskIndex = job.tasks.findIndex(t => t.id === task.id);
    if (taskIndex >= 0) {
      job.tasks[taskIndex] = task;
      
      // 更新统计
      job.completedCount = job.tasks.filter(t => t.status === 'completed').length;
      job.failedCount = job.tasks.filter(t => t.status === 'failed').length;
      
      saveBatchJob(job);
    }
  }
}

/**
 * 更新任务批次状态
 */
export function updateJobStatus(jobId: string, updates: Partial<BatchJob>): void {
  const job = loadBatchJob(jobId);
  if (job) {
    Object.assign(job, updates);
    saveBatchJob(job);
  }
}

/**
 * 导出任务结果为JSON
 */
export function exportJobResults(jobId: string): string | null {
  const job = loadBatchJob(jobId);
  if (!job) return null;
  
  const results = job.tasks.map(task => ({
    index: task.index,
    userPrompt: task.userPrompt,
    status: task.status,
    generatedHtml: task.generatedHtml,
    generatedImageUrl: task.generatedImageUrl,
    error: task.error,
  }));
  
  return JSON.stringify(results, null, 2);
}

/**
 * 获取存储使用情况
 */
export function getStorageUsage(): { used: number; total: number; percentage: number } {
  let used = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        used += key.length + value.length;
      }
    }
  }
  
  // localStorage通常限制为5-10MB
  const total = 5 * 1024 * 1024; // 5MB
  
  return {
    used,
    total,
    percentage: Math.round((used / total) * 100),
  };
}

