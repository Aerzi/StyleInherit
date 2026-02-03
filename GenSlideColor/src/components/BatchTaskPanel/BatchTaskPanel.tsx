/**
 * ============================================
 * 批量任务面板组件
 * ============================================
 * 
 * 功能：
 * - 上传Excel文件并预览
 * - 配置批量任务参数
 * - 执行、暂停、恢复批量任务
 * - 查看任务进度和结果
 * - 支持断点续传（锁屏后继续）
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  BatchJob, 
  BatchTaskItem, 
  BatchTaskConfig,
  ExcelParsedItem 
} from '../../keepstyle/batchTypes';
import { 
  parseExcelWithImages, 
  validateExcelFile,
  getExcelPreview 
} from '../../keepstyle/excelParserService';
import { 
  getBatchJobList, 
  loadBatchJob,
  deleteBatchJob,
  exportJobResults,
  getStorageUsage 
} from '../../keepstyle/batchStorageService';
import { batchExecutor } from '../../keepstyle/batchExecutorService';
import { getTemplateList, HtmlTemplateInfo } from '../../assets/template/templateLoader';

interface BatchTaskPanelProps {
  onClose?: () => void;
}

export const BatchTaskPanel: React.FC<BatchTaskPanelProps> = ({ onClose }) => {
  // 文件上传状态
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ExcelParsedItem[]>([]);
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    imageCount: number;
    sampleData: { rowIndex: number; prompt: string; hasImage: boolean }[];
  } | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);

  // 配置状态
  const [config, setConfig] = useState<BatchTaskConfig>({
    outputType: 'both',
    enableStyleExtract: true,
    promptMode: 'style_extract',
    imageModel: 'Doubao-image-seedream-v4.5',
    imageSize: '2K',
    width: 1280,
    height: 720,
    concurrency: 1,
    retryCount: 2,
    taskDelay: 3000,
  });

  // 模板列表
  const [templateList, setTemplateList] = useState<HtmlTemplateInfo[]>([]);

  // 任务状态
  const [currentJob, setCurrentJob] = useState<BatchJob | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // 历史任务
  const [jobHistory, setJobHistory] = useState<{ id: string; name: string; createdAt: number }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 存储使用情况
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 0, percentage: 0 });

  // 结果预览
  const [previewTask, setPreviewTask] = useState<BatchTaskItem | null>(null);

  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载模板列表
  useEffect(() => {
    const loadTemplates = async () => {
      const templates = await getTemplateList();
      setTemplateList(templates);
    };
    loadTemplates();
  }, []);

  // 加载历史任务和存储使用情况
  useEffect(() => {
    setJobHistory(getBatchJobList());
    setStorageUsage(getStorageUsage());
  }, [currentJob]);

  // 设置执行器回调
  useEffect(() => {
    batchExecutor.setCallbacks({
      onTaskStart: (task) => {
        console.log('任务开始:', task.index);
        setCurrentJob(batchExecutor.getCurrentJob());
      },
      onTaskProgress: (task, progress) => {
        console.log(`任务 ${task.index} 进度: ${progress}%`);
        setCurrentJob({ ...batchExecutor.getCurrentJob()! });
      },
      onTaskComplete: (task) => {
        console.log('任务完成:', task.index);
        setCurrentJob({ ...batchExecutor.getCurrentJob()! });
      },
      onTaskError: (task, error) => {
        console.error('任务失败:', task.index, error);
        setCurrentJob({ ...batchExecutor.getCurrentJob()! });
      },
      onJobProgress: (job) => {
        setCurrentJob({ ...job });
      },
      onJobComplete: (job) => {
        console.log('批量任务完成');
        setCurrentJob({ ...job });
        setIsRunning(false);
        setJobHistory(getBatchJobList());
      },
      onJobPaused: (job) => {
        console.log('批量任务暂停');
        setCurrentJob({ ...job });
        setIsPaused(true);
        setIsRunning(false);
      },
    });
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback(async (file: File) => {
    setParseError('');
    setParsedItems([]);
    setPreviewData(null);

    // 验证文件
    const validation = validateExcelFile(file);
    if (!validation.valid) {
      setParseError(validation.error || '文件验证失败');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);

    try {
      // 解析文件
      const items = await parseExcelWithImages(file);
      setParsedItems(items);

      // 获取预览信息
      const preview = await getExcelPreview(file);
      setPreviewData(preview);

      if (items.length === 0) {
        setParseError('未找到有效的数据（需要图片+文本）');
      }
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '解析失败');
    } finally {
      setIsParsing(false);
    }
  }, []);

  // 开始批量任务
  const handleStart = async () => {
    if (parsedItems.length === 0) {
      setParseError('请先上传Excel文件');
      return;
    }

    try {
      // 创建任务
      const job = await batchExecutor.createJob(
        selectedFile?.name || '批量任务',
        parsedItems,
        config
      );
      setCurrentJob(job);
      setIsRunning(true);
      setIsPaused(false);

      // 开始执行
      await batchExecutor.start();
    } catch (error) {
      setParseError(error instanceof Error ? error.message : '创建任务失败');
    }
  };

  // 暂停
  const handlePause = () => {
    batchExecutor.pause();
    setIsPaused(true);
    setIsRunning(false);
  };

  // 继续
  const handleResume = async () => {
    setIsRunning(true);
    setIsPaused(false);
    await batchExecutor.start();
  };

  // 取消
  const handleCancel = () => {
    batchExecutor.cancel();
    setIsRunning(false);
    setIsPaused(false);
  };

  // 重试失败任务
  const handleRetryFailed = async () => {
    setIsRunning(true);
    await batchExecutor.retryFailed();
  };

  // 恢复历史任务
  const handleResumeJob = (jobId: string) => {
    const job = batchExecutor.resumeJob(jobId);
    if (job) {
      setCurrentJob(job);
      setShowHistory(false);
    }
  };

  // 删除历史任务
  const handleDeleteJob = (jobId: string) => {
    deleteBatchJob(jobId);
    setJobHistory(getBatchJobList());
    setStorageUsage(getStorageUsage());
  };

  // 导出结果
  const handleExportResults = (jobId: string) => {
    const json = exportJobResults(jobId);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch-results-${jobId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  // 渲染任务进度条
  const renderProgress = () => {
    if (!currentJob) return null;

    const { totalCount, completedCount, failedCount, status } = currentJob;
    const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white font-medium">
            {currentJob.name}
          </span>
          <span className={`px-2 py-1 rounded text-xs ${
            status === 'running' ? 'bg-blue-600' :
            status === 'paused' ? 'bg-yellow-600' :
            status === 'completed' ? 'bg-green-600' :
            status === 'cancelled' ? 'bg-red-600' :
            'bg-gray-600'
          }`}>
            {status === 'running' ? '运行中' :
             status === 'paused' ? '已暂停' :
             status === 'completed' ? '已完成' :
             status === 'cancelled' ? '已取消' : '空闲'}
          </span>
        </div>

        <div className="w-full bg-gray-700 rounded-full h-3 mb-2">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex justify-between text-sm text-gray-400">
          <span>进度: {completedCount}/{totalCount} ({progress}%)</span>
          <span className="text-red-400">失败: {failedCount}</span>
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-2 mt-3">
          {status === 'running' && (
            <button
              onClick={handlePause}
              className="px-3 py-1 bg-yellow-600 hover:bg-yellow-500 rounded text-sm"
            >
              ⏸️ 暂停
            </button>
          )}
          {status === 'paused' && (
            <button
              onClick={handleResume}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
            >
              ▶️ 继续
            </button>
          )}
          {(status === 'running' || status === 'paused') && (
            <button
              onClick={handleCancel}
              className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
            >
              ⏹️ 取消
            </button>
          )}
          {failedCount > 0 && status !== 'running' && (
            <button
              onClick={handleRetryFailed}
              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 rounded text-sm"
            >
              🔄 重试失败
            </button>
          )}
          {status === 'completed' && (
            <button
              onClick={() => handleExportResults(currentJob.id)}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm"
            >
              📥 导出结果
            </button>
          )}
        </div>
      </div>
    );
  };

  // 渲染任务列表
  const renderTaskList = () => {
    if (!currentJob) return null;

    return (
      <div className="bg-gray-800 rounded-lg p-4 max-h-80 overflow-y-auto">
        <h3 className="text-white font-medium mb-3">任务列表</h3>
        <div className="space-y-2">
          {currentJob.tasks.map((task) => (
            <div 
              key={task.id}
              className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-700 ${
                task.status === 'completed' ? 'bg-green-900/30' :
                task.status === 'failed' ? 'bg-red-900/30' :
                task.status === 'pending' ? 'bg-gray-700/50' :
                'bg-blue-900/30'
              }`}
              onClick={() => setPreviewTask(task)}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm w-8">#{task.index}</span>
                <span className="text-white text-sm truncate max-w-[200px]">
                  {task.userPrompt}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  task.status === 'completed' ? 'bg-green-600' :
                  task.status === 'failed' ? 'bg-red-600' :
                  task.status === 'pending' ? 'bg-gray-600' :
                  'bg-blue-600'
                }`}>
                  {task.status === 'completed' ? '完成' :
                   task.status === 'failed' ? '失败' :
                   task.status === 'pending' ? '待处理' :
                   task.status === 'extracting' ? '提取中' :
                   task.status === 'generating_html' ? '生成HTML' :
                   task.status === 'generating_image' ? '生成图片' : task.status}
                </span>
                {task.progress > 0 && task.progress < 100 && (
                  <span className="text-xs text-gray-400">{task.progress}%</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 渲染结果预览弹窗
  const renderPreviewModal = () => {
    if (!previewTask) return null;

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg w-[90vw] max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <h3 className="text-white font-medium">
              任务 #{previewTask.index} - {previewTask.userPrompt.substring(0, 30)}...
            </h3>
            <button
              onClick={() => setPreviewTask(null)}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {/* 参考图片 */}
            <div className="mb-4">
              <h4 className="text-gray-400 text-sm mb-2">参考图片</h4>
              <img 
                src={previewTask.referenceImageBase64}
                alt="参考图"
                className="max-h-40 rounded"
              />
            </div>

            {/* 提取的样式 */}
            {previewTask.extractedStyle && (
              <div className="mb-4">
                <h4 className="text-gray-400 text-sm mb-2">提取的样式</h4>
                <pre className="bg-gray-800 p-2 rounded text-xs text-gray-300 overflow-x-auto max-h-32 overflow-y-auto">
                  {previewTask.extractedStyle}
                </pre>
              </div>
            )}

            {/* 生成的HTML */}
            {previewTask.generatedHtml && (
              <div className="mb-4">
                <h4 className="text-gray-400 text-sm mb-2">生成的HTML</h4>
                <iframe
                  srcDoc={previewTask.generatedHtml}
                  className="w-full bg-white rounded"
                  style={{ aspectRatio: '16/9', maxHeight: '300px' }}
                  title="HTML预览"
                />
              </div>
            )}

            {/* 生成的图片 */}
            {previewTask.generatedImageUrl && (
              <div className="mb-4">
                <h4 className="text-gray-400 text-sm mb-2">生成的图片</h4>
                <img 
                  src={previewTask.generatedImageUrl}
                  alt="生成图片"
                  className="max-h-60 rounded"
                />
              </div>
            )}

            {/* 错误信息 */}
            {previewTask.error && (
              <div className="mb-4">
                <h4 className="text-red-400 text-sm mb-2">错误信息</h4>
                <pre className="bg-red-900/30 p-2 rounded text-xs text-red-300">
                  {previewTask.error}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-40">
      <div className="bg-gray-900 rounded-xl w-[95vw] max-w-6xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-white">📊 批量生成样张</h2>
            <span className="text-xs text-gray-400">
              存储: {storageUsage.percentage}% 已使用
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              📋 历史任务 ({jobHistory.length})
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        {/* 主内容区 */}
        <div className="flex-1 overflow-hidden flex">
          {/* 左侧配置区 */}
          <div className="w-1/3 p-4 border-r border-gray-700 overflow-y-auto">
            {/* 文件上传 */}
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">上传Excel文件</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isParsing || isRunning}
                className="w-full py-3 border-2 border-dashed border-gray-600 hover:border-blue-500 rounded-lg text-gray-400 hover:text-white transition-colors"
              >
                {isParsing ? '解析中...' : selectedFile ? `📄 ${selectedFile.name}` : '点击或拖拽上传Excel'}
              </button>
              {parseError && (
                <p className="text-red-400 text-xs mt-1">{parseError}</p>
              )}
            </div>

            {/* 预览信息 */}
            {previewData && (
              <div className="mb-4 p-3 bg-gray-800 rounded-lg">
                <p className="text-white text-sm">
                  共 {previewData.totalRows} 条数据，{previewData.imageCount} 张图片
                </p>
                <div className="mt-2 space-y-1">
                  {previewData.sampleData.map((item, i) => (
                    <div key={i} className="text-xs text-gray-400 flex items-center gap-2">
                      <span>#{item.rowIndex}</span>
                      {item.hasImage && <span className="text-green-400">🖼️</span>}
                      <span className="truncate">{item.prompt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 配置项 */}
            <div className="space-y-3">
              <div>
                <label className="block text-gray-300 text-sm mb-1">输出类型</label>
                <select
                  value={config.outputType}
                  onChange={(e) => setConfig({ ...config, outputType: e.target.value as 'html' | 'image' | 'both' })}
                  disabled={isRunning}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                >
                  <option value="both">HTML + 图片</option>
                  <option value="html">仅 HTML</option>
                  <option value="image">仅 图片</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enableStyleExtract"
                  checked={config.enableStyleExtract}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    enableStyleExtract: e.target.checked,
                    promptMode: e.target.checked ? 'style_extract' : 'image_reference'
                  })}
                  disabled={isRunning}
                  className="rounded"
                />
                <label htmlFor="enableStyleExtract" className="text-gray-300 text-sm">
                  启用样式提取（更精准但更慢）
                </label>
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">HTML模板（可选）</label>
                <select
                  value={config.htmlTemplateId ?? ''}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    htmlTemplateId: e.target.value ? (isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) : undefined
                  })}
                  disabled={isRunning}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                >
                  <option value="">不使用模板</option>
                  {templateList.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">图片生成模型</label>
                <select
                  value={config.imageModel}
                  onChange={(e) => setConfig({ 
                    ...config, 
                    imageModel: e.target.value,
                    imageSize: e.target.value.includes('Doubao') ? '2K' : '1K'
                  })}
                  disabled={isRunning}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                >
                  <option value="Doubao-image-seedream-v4.5">Doubao (推荐)</option>
                  <option value="gemini-3-pro-image-preview">Gemini</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">任务间隔 (秒)</label>
                <input
                  type="number"
                  value={config.taskDelay / 1000}
                  onChange={(e) => setConfig({ ...config, taskDelay: Number(e.target.value) * 1000 })}
                  min={1}
                  max={30}
                  disabled={isRunning}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">避免请求过快被限流</p>
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-1">失败重试次数</label>
                <input
                  type="number"
                  value={config.retryCount}
                  onChange={(e) => setConfig({ ...config, retryCount: Number(e.target.value) })}
                  min={0}
                  max={5}
                  disabled={isRunning}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                />
              </div>
            </div>

            {/* 开始按钮 */}
            {!isRunning && !isPaused && (
              <button
                onClick={handleStart}
                disabled={parsedItems.length === 0}
                className="w-full mt-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium"
              >
                🚀 开始批量生成 ({parsedItems.length} 个任务)
              </button>
            )}

            {/* 锁屏提示 */}
            <div className="mt-4 p-3 bg-blue-900/30 rounded-lg">
              <p className="text-blue-300 text-xs">
                💡 <strong>锁屏续传</strong>：任务进度自动保存到本地存储。
                即使锁屏或刷新页面，也可从"历史任务"中恢复继续执行。
              </p>
            </div>
          </div>

          {/* 右侧进度区 */}
          <div className="flex-1 p-4 overflow-y-auto">
            {currentJob ? (
              <>
                {renderProgress()}
                {renderTaskList()}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <p className="text-4xl mb-4">📁</p>
                  <p>上传Excel文件开始批量生成</p>
                  <p className="text-sm mt-2">
                    Excel格式：第一列为主题文本，浮动图片为参考图
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 历史任务侧边栏 */}
        {showHistory && (
          <div className="absolute right-0 top-0 h-full w-80 bg-gray-800 shadow-xl overflow-y-auto">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-white font-medium">历史任务</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">×</button>
            </div>
            <div className="p-4 space-y-2">
              {jobHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-4">暂无历史任务</p>
              ) : (
                jobHistory.map((job) => (
                  <div key={job.id} className="p-3 bg-gray-700 rounded-lg">
                    <p className="text-white text-sm truncate">{job.name}</p>
                    <p className="text-gray-400 text-xs">
                      {new Date(job.createdAt).toLocaleString()}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleResumeJob(job.id)}
                        className="text-xs px-2 py-1 bg-blue-600 rounded hover:bg-blue-500"
                      >
                        恢复
                      </button>
                      <button
                        onClick={() => handleExportResults(job.id)}
                        className="text-xs px-2 py-1 bg-green-600 rounded hover:bg-green-500"
                      >
                        导出
                      </button>
                      <button
                        onClick={() => handleDeleteJob(job.id)}
                        className="text-xs px-2 py-1 bg-red-600 rounded hover:bg-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 结果预览弹窗 */}
        {renderPreviewModal()}
      </div>
    </div>
  );
};

export default BatchTaskPanel;

