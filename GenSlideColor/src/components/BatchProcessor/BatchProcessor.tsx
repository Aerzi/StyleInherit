/**
 * ============================================
 * 批量处理组件
 * ============================================
 * 
 * 功能：
 * - 上传 Excel 文件并解析
 * - 配置批量任务参数
 * - 显示任务进度
 * - 支持暂停/恢复/取消
 * - 查看和导出结果
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { parseExcelFile, isValidExcelFile, parseImagesFolder } from '../../keepstyle/excelParser';
import { batchProcessor } from '../../keepstyle/batchService';
import {
  BatchSession,
  BatchTaskItem,
  BatchConfig,
  ExcelRowItem,
  DEFAULT_BATCH_CONFIG,
} from '../../keepstyle/batchTypes';
import { DEFAULT_BATCH_CONFIG } from '../../keepstyle/batchTypes';
import type { HtmlTemplateInfo } from '../../assets/template/templateLoader';
import { getTemplateList, loadTemplateById, HtmlTemplateInfo } from '../../assets/template/templateLoader';

// 图片模型选项
const IMAGE_MODELS = [
  { value: 'Doubao-image-seedream-v4.5', label: 'Doubao (2K, 适合商务)' },
  { value: 'gemini-3-pro-image-preview', label: 'Gemini (1K, 支持参考图)' },
];

interface BatchProcessorProps {
  onClose?: () => void;
}

export const BatchProcessor: React.FC<BatchProcessorProps> = ({ onClose }) => {
  // ========== 状态 ==========
  const [step, setStep] = useState<'upload' | 'config' | 'running' | 'results'>('upload');
  const [excelItems, setExcelItems] = useState<ExcelRowItem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  
  // 配置
  const [config, setConfig] = useState<Partial<BatchConfig>>(DEFAULT_BATCH_CONFIG);
  const [templates, setTemplates] = useState<HtmlTemplateInfo[]>([]);
  
  // 会话状态
  const [session, setSession] = useState<BatchSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 预览
  const [previewTask, setPreviewTask] = useState<BatchTaskItem | null>(null);
  const [previewTab, setPreviewTab] = useState<'html' | 'image'>('html');
  
  // 历史会话
  const [showHistory, setShowHistory] = useState(false);
  const [historySessions, setHistorySessions] = useState<BatchSession[]>([]);

  // 文件输入引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesFolderRef = useRef<HTMLInputElement>(null);

  // ========== 初始化 ==========
  useEffect(() => {
    // 加载模板列表
    getTemplateList().then(setTemplates);
    
    // 加载历史会话
    setHistorySessions(batchProcessor.getAllSessions());
    
    // 检查是否有未完成的会话
    if (batchProcessor.hasUnfinishedSession()) {
      const unfinished = batchProcessor.getSession();
      if (unfinished) {
        setSession(unfinished);
        setStep('running');
      }
    }
  }, []);

  // ========== 文件解析 ==========
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidExcelFile(file)) {
      setParseErrors(['请上传 .xlsx 或 .xls 格式的文件']);
      return;
    }

    setFileName(file.name);
    setParseErrors([]);

    const result = await parseExcelFile(file);
    
    if (result.success) {
      setExcelItems(result.items);
      setParseErrors(result.errors || []);
      setStep('config');
    } else {
      setExcelItems([]);
      setParseErrors(result.errors || ['解析失败']);
    }
  }, []);

  // 手动上传图片文件夹（备用方案）
  const handleImagesFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const images = await parseImagesFolder(files);
    
    // 更新已有的 excelItems，匹配图片
    if (excelItems.length > 0) {
      const updated = excelItems.map((item, index) => {
        const img = images.find(i => i.rowIndex === item.rowIndex) || images[index];
        return img ? { ...item, imageBase64: img.base64, imageName: img.name } : item;
      });
      setExcelItems(updated);
      setParseErrors([]);
    } else {
      // 如果没有 Excel 数据，使用图片文件名作为主题
      const items: ExcelRowItem[] = images.map((img, index) => ({
        rowIndex: index + 1,
        theme: img.name.replace(/\.[^/.]+$/, ''), // 去掉扩展名
        imageBase64: img.base64,
        imageName: img.name,
      }));
      setExcelItems(items);
    }
  }, [excelItems]);

  // ========== 配置处理 ==========
  const handleConfigChange = useCallback(<K extends keyof BatchConfig>(
    key: K,
    value: BatchConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleTemplateSelect = useCallback(async (templateId: string | number) => {
    if (!templateId) {
      handleConfigChange('htmlTemplateId', undefined);
      handleConfigChange('htmlTemplateContent', undefined);
      return;
    }

    const id = typeof templateId === 'string' ? 
      (templateId.match(/^\d+$/) ? parseInt(templateId) : templateId) : 
      templateId;
    
    handleConfigChange('htmlTemplateId', id);
    
    const content = await loadTemplateById(id);
    if (content) {
      handleConfigChange('htmlTemplateContent', content);
    }
  }, [handleConfigChange]);

  // ========== 批量任务控制 ==========
  const startBatch = useCallback(async () => {
    if (excelItems.length === 0) return;

    const newSession = batchProcessor.createSession(fileName, excelItems, config);
    setSession(newSession);
    setStep('running');
    setIsProcessing(true);

    await batchProcessor.start({
      onTaskStart: (task) => {
        setSession(prev => prev ? { ...prev, tasks: [...prev.tasks] } : null);
      },
      onTaskProgress: (task, progress) => {
        setSession(batchProcessor.getSession());
      },
      onTaskComplete: (task) => {
        setSession(batchProcessor.getSession());
      },
      onTaskError: (task, error) => {
        setSession(batchProcessor.getSession());
        console.error(`任务 ${task.index} 失败:`, error);
      },
      onSessionProgress: (s) => {
        setSession({ ...s });
      },
      onSessionComplete: (s) => {
        setSession({ ...s });
        setIsProcessing(false);
        setStep('results');
      },
      onSessionPaused: (s) => {
        setSession({ ...s });
        setIsProcessing(false);
      },
    });

    setIsProcessing(false);
  }, [excelItems, fileName, config]);

  const pauseBatch = useCallback(() => {
    batchProcessor.pause();
    setIsProcessing(false);
  }, []);

  const resumeBatch = useCallback(async () => {
    setIsProcessing(true);
    await batchProcessor.resume({
      onTaskStart: () => setSession(batchProcessor.getSession()),
      onTaskProgress: () => setSession(batchProcessor.getSession()),
      onTaskComplete: () => setSession(batchProcessor.getSession()),
      onTaskError: () => setSession(batchProcessor.getSession()),
      onSessionProgress: (s) => setSession({ ...s }),
      onSessionComplete: (s) => {
        setSession({ ...s });
        setIsProcessing(false);
        setStep('results');
      },
      onSessionPaused: (s) => {
        setSession({ ...s });
        setIsProcessing(false);
      },
    });
    setIsProcessing(false);
  }, []);

  const cancelBatch = useCallback(() => {
    batchProcessor.cancel();
    setIsProcessing(false);
  }, []);

  // ========== 结果处理 ==========
  const exportResults = useCallback(() => {
    const json = batchProcessor.exportResults();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch_results_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const loadHistorySession = useCallback((sessionId: string) => {
    const loaded = batchProcessor.loadSession(sessionId);
    if (loaded) {
      setSession(loaded);
      setStep(loaded.status === 'completed' ? 'results' : 'running');
      setShowHistory(false);
    }
  }, []);

  // ========== 渲染 ==========
  
  // 上传步骤
  const renderUploadStep = () => (
    <div className="flex flex-col items-center justify-center p-8 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">📊 批量样张生成</h2>
        <p className="text-gray-600">上传包含主题和浮动图片的 Excel 文件</p>
      </div>

      {/* 主上传区域 */}
      <div
        className="w-full max-w-md p-8 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="text-center">
          <span className="text-5xl">📁</span>
          <p className="mt-4 text-lg font-medium text-blue-700">点击上传 Excel 文件</p>
          <p className="mt-1 text-sm text-blue-500">支持 .xlsx, .xls 格式</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* 备用方案：手动上传图片 */}
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-2">如果 Excel 中的图片无法提取，可以：</p>
        <button
          className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          onClick={() => imagesFolderRef.current?.click()}
        >
          📷 手动上传图片文件夹
        </button>
        <input
          ref={imagesFolderRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={handleImagesFolderSelect}
        />
      </div>

      {/* 错误信息 */}
      {parseErrors.length > 0 && (
        <div className="w-full max-w-md p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="font-medium text-red-700 mb-2">⚠️ 解析警告：</p>
          <ul className="text-sm text-red-600 list-disc list-inside">
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 历史会话按钮 */}
      <button
        className="text-sm text-blue-600 hover:underline"
        onClick={() => {
          setHistorySessions(batchProcessor.getAllSessions());
          setShowHistory(true);
        }}
      >
        📋 查看历史会话 ({batchProcessor.getAllSessions().length})
      </button>
    </div>
  );

  // 配置步骤
  const renderConfigStep = () => (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">⚙️ 配置批量任务</h2>
        <span className="text-sm text-gray-500">
          共 {excelItems.length} 个任务
        </span>
      </div>

      {/* 任务预览 */}
      <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="pb-2 w-12">#</th>
              <th className="pb-2">主题</th>
              <th className="pb-2 w-24">图片</th>
            </tr>
          </thead>
          <tbody>
            {excelItems.slice(0, 10).map((item) => (
              <tr key={item.rowIndex} className="border-t border-gray-200">
                <td className="py-2">{item.rowIndex}</td>
                <td className="py-2 truncate max-w-xs">{item.theme}</td>
                <td className="py-2">
                  {item.imageBase64 ? (
                    <img
                      src={item.imageBase64}
                      alt=""
                      className="w-12 h-8 object-cover rounded"
                    />
                  ) : (
                    <span className="text-red-500">无图片</span>
                  )}
                </td>
              </tr>
            ))}
            {excelItems.length > 10 && (
              <tr className="text-gray-500">
                <td colSpan={3} className="py-2 text-center">
                  ... 还有 {excelItems.length - 10} 个任务
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 配置选项 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 样式提取 */}
        <label className="flex items-center space-x-2 p-3 bg-white rounded-lg border">
          <input
            type="checkbox"
            checked={config.enableStyleExtract}
            onChange={(e) => handleConfigChange('enableStyleExtract', e.target.checked)}
            className="w-4 h-4"
          />
          <span>启用样式提取</span>
        </label>

        {/* 输出类型 */}
        <div className="p-3 bg-white rounded-lg border">
          <label className="block text-sm text-gray-600 mb-1">输出类型</label>
          <select
            value={config.outputType}
            onChange={(e) => handleConfigChange('outputType', e.target.value as 'html' | 'image' | 'both')}
            className="w-full p-2 border rounded"
          >
            <option value="html">仅 HTML</option>
            <option value="image">仅图片</option>
            <option value="both">HTML + 图片</option>
          </select>
        </div>

        {/* 图片模型 */}
        <div className="p-3 bg-white rounded-lg border">
          <label className="block text-sm text-gray-600 mb-1">图片模型</label>
          <select
            value={config.imageModel}
            onChange={(e) => handleConfigChange('imageModel', e.target.value)}
            className="w-full p-2 border rounded"
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* HTML 模板 */}
        <div className="p-3 bg-white rounded-lg border">
          <label className="block text-sm text-gray-600 mb-1">HTML 模板</label>
          <select
            value={config.htmlTemplateId?.toString() || ''}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="w-full p-2 border rounded"
          >
            <option value="">不使用模板</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* 任务间隔 */}
        <div className="p-3 bg-white rounded-lg border">
          <label className="block text-sm text-gray-600 mb-1">任务间隔 (秒)</label>
          <input
            type="number"
            min={0}
            max={60}
            value={(config.taskInterval || 2000) / 1000}
            onChange={(e) => handleConfigChange('taskInterval', parseInt(e.target.value) * 1000)}
            className="w-full p-2 border rounded"
          />
        </div>

        {/* 重试次数 */}
        <div className="p-3 bg-white rounded-lg border">
          <label className="block text-sm text-gray-600 mb-1">失败重试次数</label>
          <input
            type="number"
            min={0}
            max={10}
            value={config.retryLimit}
            onChange={(e) => handleConfigChange('retryLimit', parseInt(e.target.value))}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      {/* 锁屏提示 */}
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>💡 持续运行提示：</strong> 任务进度会自动保存到本地存储。
          即使锁屏或刷新页面，也可以从断点继续执行。
        </p>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end space-x-3">
        <button
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition"
          onClick={() => setStep('upload')}
        >
          返回
        </button>
        <button
          className="px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition"
          onClick={startBatch}
        >
          🚀 开始批量生成
        </button>
      </div>
    </div>
  );

  // 运行中步骤
  const renderRunningStep = () => {
    if (!session) return null;

    const progress = session.totalTasks > 0
      ? Math.round(((session.completedTasks + session.failedTasks) / session.totalTasks) * 100)
      : 0;

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">
            {isProcessing ? '⏳ 正在处理...' : session.status === 'paused' ? '⏸️ 已暂停' : '✅ 处理完成'}
          </h2>
          <span className="text-sm text-gray-500">
            {session.completedTasks}/{session.totalTasks} 完成
            {session.failedTasks > 0 && <span className="text-red-500 ml-2">({session.failedTasks} 失败)</span>}
          </span>
        </div>

        {/* 进度条 */}
        <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="absolute h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
            {progress}%
          </span>
        </div>

        {/* 任务列表 */}
        <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
          <div className="space-y-2">
            {session.tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-center p-3 rounded-lg cursor-pointer transition ${
                  task.status === 'completed' ? 'bg-green-50 border border-green-200' :
                  task.status === 'failed' ? 'bg-red-50 border border-red-200' :
                  task.status === 'extracting' || task.status === 'generating' ? 'bg-blue-50 border border-blue-200 animate-pulse' :
                  'bg-white border border-gray-200'
                }`}
                onClick={() => task.result && setPreviewTask(task)}
              >
                <span className="w-8 text-center font-mono text-sm">{task.index}</span>
                <span className="flex-1 truncate mx-3">{task.theme}</span>
                <span className="text-sm">
                  {task.status === 'pending' && '⏳ 等待'}
                  {task.status === 'extracting' && '🔍 提取样式...'}
                  {task.status === 'generating' && '🎨 生成中...'}
                  {task.status === 'completed' && '✅ 完成'}
                  {task.status === 'failed' && `❌ ${task.error || '失败'}`}
                  {task.status === 'cancelled' && '⏹️ 已取消'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex justify-end space-x-3">
          {isProcessing ? (
            <button
              className="px-4 py-2 bg-yellow-500 text-white hover:bg-yellow-600 rounded-lg transition"
              onClick={pauseBatch}
            >
              ⏸️ 暂停
            </button>
          ) : session.status === 'paused' ? (
            <button
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition"
              onClick={resumeBatch}
            >
              ▶️ 继续
            </button>
          ) : null}
          
          <button
            className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition"
            onClick={cancelBatch}
            disabled={!isProcessing && session.status !== 'paused'}
          >
            ⏹️ 取消
          </button>

          {session.status === 'completed' && (
            <button
              className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition"
              onClick={() => setStep('results')}
            >
              📊 查看结果
            </button>
          )}
        </div>
      </div>
    );
  };

  // 结果步骤
  const renderResultsStep = () => {
    if (!session) return null;

    const completedTasks = session.tasks.filter(t => t.status === 'completed');

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">📊 批量结果</h2>
          <div className="space-x-2">
            <button
              className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition"
              onClick={exportResults}
            >
              📥 导出 JSON
            </button>
            <button
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition"
              onClick={() => {
                setStep('upload');
                setExcelItems([]);
                setSession(null);
              }}
            >
              🔄 新建批次
            </button>
          </div>
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-blue-600">{session.totalTasks}</p>
            <p className="text-sm text-blue-700">总任务</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-green-600">{session.completedTasks}</p>
            <p className="text-sm text-green-700">成功</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg text-center">
            <p className="text-2xl font-bold text-red-600">{session.failedTasks}</p>
            <p className="text-sm text-red-700">失败</p>
          </div>
        </div>

        {/* 结果列表 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-96 overflow-y-auto">
          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="p-3 bg-white rounded-lg border hover:shadow-lg transition cursor-pointer"
              onClick={() => setPreviewTask(task)}
            >
              <p className="text-sm font-medium truncate mb-2">{task.theme}</p>
              {task.result?.imageUrl ? (
                <img
                  src={task.result.imageUrl}
                  alt=""
                  className="w-full aspect-video object-cover rounded"
                />
              ) : task.result?.html ? (
                <div className="w-full aspect-video bg-gray-100 rounded flex items-center justify-center text-gray-500">
                  HTML
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // 预览弹窗
  const renderPreviewModal = () => {
    if (!previewTask || !previewTask.result) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-bold">{previewTask.theme}</h3>
            <button
              className="p-2 hover:bg-gray-100 rounded-full"
              onClick={() => setPreviewTask(null)}
            >
              ✕
            </button>
          </div>
          
          {/* 标签页 */}
          {previewTask.result.html && previewTask.result.imageUrl && (
            <div className="flex border-b">
              <button
                className={`px-4 py-2 ${previewTab === 'html' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                onClick={() => setPreviewTab('html')}
              >
                HTML
              </button>
              <button
                className={`px-4 py-2 ${previewTab === 'image' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                onClick={() => setPreviewTab('image')}
              >
                图片
              </button>
            </div>
          )}
          
          <div className="flex-1 overflow-auto p-4">
            {(previewTab === 'html' && previewTask.result.html) ? (
              <iframe
                srcDoc={previewTask.result.html}
                className="w-full border rounded"
                style={{ aspectRatio: '16/9' }}
              />
            ) : previewTask.result.imageUrl ? (
              <img
                src={previewTask.result.imageUrl}
                alt=""
                className="max-w-full mx-auto"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  // 历史会话弹窗
  const renderHistoryModal = () => {
    if (!showHistory) return null;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl w-[90vw] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-bold">📋 历史会话</h3>
            <button
              className="p-2 hover:bg-gray-100 rounded-full"
              onClick={() => setShowHistory(false)}
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-auto p-4">
            {historySessions.length === 0 ? (
              <p className="text-center text-gray-500 py-8">暂无历史会话</p>
            ) : (
              <div className="space-y-3">
                {historySessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                    onClick={() => loadHistorySession(s.id)}
                  >
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-gray-500">
                        {s.completedTasks}/{s.totalTasks} 完成 · 
                        {new Date(s.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded ${
                      s.status === 'completed' ? 'bg-green-100 text-green-700' :
                      s.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {s.status === 'completed' ? '已完成' :
                       s.status === 'paused' ? '已暂停' :
                       s.status === 'running' ? '运行中' : s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t">
            <button
              className="w-full py-2 text-red-600 hover:bg-red-50 rounded-lg transition"
              onClick={() => {
                batchProcessor.clearAllSessions();
                setHistorySessions([]);
              }}
            >
              🗑️ 清空所有历史
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
      <div className="bg-white rounded-2xl w-[90vw] max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="p-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <h1 className="text-lg font-bold">🚀 批量样张生成器</h1>
          <button
            className="p-2 hover:bg-white/20 rounded-full transition"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto">
          {step === 'upload' && renderUploadStep()}
          {step === 'config' && renderConfigStep()}
          {step === 'running' && renderRunningStep()}
          {step === 'results' && renderResultsStep()}
        </div>
      </div>

      {/* 弹窗 */}
      {renderPreviewModal()}
      {renderHistoryModal()}
    </div>
  );
};

export default BatchProcessor;

