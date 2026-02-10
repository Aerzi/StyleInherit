/**
 * 批量测试面板
 * 记录每一步：原始图、提取的文本样式、图片清洗效果、生成结果，并导出为 ZIP
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  parseExcelWithImages,
  parseExcelWithImagesFromFolder,
  validateExcelFile,
  getExcelPreview,
} from '../../keepstyle/excelParserService';
import type { ExcelParsedItem } from '../../keepstyle/batchTypes';
import {
  runWhiteboxBatch,
  buildWhiteboxZip,
  type WhiteboxTaskInput,
  type WhiteboxConfig,
  type WhiteboxTaskRecord,
} from '../../keepstyle/whiteboxBatchService';
import { fetchModels, type ModelInfo } from '../../services/llmService';

export const WhiteboxBatchPanel: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ExcelParsedItem[]>([]);
  const [preview, setPreview] = useState<{
    totalRows: number;
    imageCount: number;
    sampleData: { rowIndex: number; prompt: string; hasImage: boolean }[];
  } | null>(null);
  const [parseError, setParseError] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  const defaultChatModel = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_NAME || 'doubao-seed-1.8';
  const [config, setConfig] = useState<WhiteboxConfig>({
    enableStyleExtract: true,
    enableImageCleaning: true,
    outputType: 'both',
    extractModel: defaultChatModel,
    htmlModel: defaultChatModel,
    imageModel: 'Doubao-image-seedream-v4.5',
    imageSize: '2K',
    width: 1280,
    height: 720,
    taskDelayMs: 2000,
  });
  const [chatModelList, setChatModelList] = useState<ModelInfo[]>([]);

  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentTask, setCurrentTask] = useState({ index: 0, total: 0 });
  const [results, setResults] = useState<WhiteboxTaskRecord[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFolderRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchModels().then((list) => {
      const next =
        list.length > 0 && !list.some((m) => m.id === 'doubao-seed-1.8')
          ? [{ id: 'doubao-seed-1.8', object: 'model', created: Date.now() }, ...list]
          : list;
      setChatModelList(next);
    });
  }, []);

  const addLog = (line: string) => {
    setLogs((prev) => [...prev, line]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateExcelFile(file);
    if (!validation.valid) {
      setParseError(validation.error ?? '');
      setSelectedFile(null);
      setParsedItems([]);
      setPreview(null);
      return;
    }

    setSelectedFile(file);
    setParseError('');
    setIsParsing(true);
    setPreview(null);
    setParsedItems([]);

    try {
      const items =
        imageFiles.length > 0
          ? await parseExcelWithImagesFromFolder(file, imageFiles)
          : await parseExcelWithImages(file);
      setParsedItems(items);
      if (imageFiles.length > 0) {
        setPreview({
          totalRows: items.length,
          imageCount: items.filter((i) => i.imageBase64).length,
          sampleData: items.slice(0, 5).map((i) => ({
            rowIndex: i.rowIndex,
            prompt: (i.userPrompt ?? i.theme ?? '').substring(0, 50) + ((i.userPrompt ?? i.theme ?? '').length > 50 ? '...' : ''),
            hasImage: !!i.imageBase64,
          })),
        });
      } else {
        const previewData = await getExcelPreview(file);
        setPreview(previewData);
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsParsing(false);
    }
    e.target.value = '';
  };

  const handleImageFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const list = Array.from(files);
    setImageFiles(list);
    e.target.value = '';
    if (selectedFile) {
      setParseError('');
      setIsParsing(true);
      setPreview(null);
      setParsedItems([]);
      try {
        const items = await parseExcelWithImagesFromFolder(selectedFile, list);
        setParsedItems(items);
        setPreview({
          totalRows: items.length,
          imageCount: items.filter((i) => i.imageBase64).length,
          sampleData: items.slice(0, 5).map((i) => ({
            rowIndex: i.rowIndex,
            prompt: (i.userPrompt ?? i.theme ?? '').substring(0, 50) + ((i.userPrompt ?? i.theme ?? '').length > 50 ? '...' : ''),
            hasImage: !!i.imageBase64,
          })),
        });
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleRun = async () => {
    if (parsedItems.length === 0) {
      addLog('请先上传并解析 Excel 文件');
      return;
    }

    const items: WhiteboxTaskInput[] = parsedItems.map((item) => ({
      index: item.rowIndex,
      userPrompt: item.userPrompt ?? (item as { theme?: string }).theme ?? '',
      imageBase64: item.imageBase64,
      imageName: `row_${item.rowIndex}`,
    }));

    setIsRunning(true);
    setLogs([]);
    setResults([]);

    try {
      addLog(`开始批量测试，共 ${items.length} 条任务`);
      addLog(`配置: 样式提取=${config.enableStyleExtract} 图片清洗=${config.enableImageCleaning} 输出=${config.outputType}`);
      addLog('---');

      const records = await runWhiteboxBatch(items, config, {
        onTaskStart: (index, total) => {
          setCurrentTask({ index, total });
          addLog(`\n========== 任务 ${index}/${total} ==========`);
        },
        onTaskStep: (index, step, message) => {
          if (message) addLog(`  [${step}] ${message}`);
        },
        onTaskComplete: (index, record) => {
          addLog(`  完成: 样式=${!!record.styleDescription} 清洗=${!!record.cleanedImageUrl} HTML=${!!record.html} 图片=${!!record.imageUrl}`);
        },
        onTaskError: (index, error) => {
          addLog(`  失败: ${error}`);
        },
        onLog: addLog,
      });

      setResults(records);
      const successCount = records.filter((r) => r.success).length;
      addLog('\n---');
      addLog(`全部结束: 成功 ${successCount}/${records.length}`);

      addLog('正在打包 ZIP…');
      const zipBlob = await buildWhiteboxZip(records, config);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whitebox_batch_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      addLog('ZIP 已下载');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`批跑异常: ${msg}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      <div className="p-6 border-b border-gray-200 bg-white">
        <h1 className="text-xl font-bold text-gray-800">批量测试</h1>
        <p className="text-sm text-gray-500 mt-1">
          记录每一步：原始图 → 提取的文本样式 → 图片清洗效果 → 生成结果，并导出 ZIP。Excel 第一列主题、第二列图片文件名；可选「选择图片文件夹」按文件名在文件夹中找图。
        </p>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 p-4">
        <div className="w-96 flex flex-col gap-4 overflow-auto shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">1. 上传 Excel</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing || isRunning}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isParsing ? '解析中…' : selectedFile ? selectedFile.name : '选择 Excel 文件'}
            </button>
            <p className="text-xs text-gray-500 mt-2">第一列：主题；第二列：图片文件名（可选）</p>
            <input
              ref={imageFolderRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageFolderChange}
            />
            <button
              type="button"
              onClick={() => imageFolderRef.current?.click()}
              disabled={isParsing || isRunning}
              className="w-full mt-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 text-sm"
            >
              {imageFiles.length > 0 ? `已选 ${imageFiles.length} 张图（按文件名匹配）` : '选择图片文件夹'}
            </button>
            {parseError && <p className="text-red-600 text-sm mt-2">{parseError}</p>}
            {preview && (
              <p className="text-gray-600 text-sm mt-2">
                共 {preview.totalRows} 行，{preview.imageCount} 张图
              </p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-800 mb-3">2. 配置</h2>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={config.enableStyleExtract}
                onChange={(e) => setConfig((c) => ({ ...c, enableStyleExtract: e.target.checked }))}
                disabled={isRunning}
              />
              <span className="text-sm">启用样式提取</span>
            </label>
            {config.enableStyleExtract && (
              <>
                <label className="block text-sm text-gray-600 mt-2">样式提取模型</label>
                <select
                  value={config.extractModel ?? defaultChatModel}
                  onChange={(e) => setConfig((c) => ({ ...c, extractModel: e.target.value }))}
                  disabled={isRunning}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {chatModelList.length > 0
                    ? chatModelList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))
                    : <option value={defaultChatModel}>{defaultChatModel}</option>}
                </select>
              </>
            )}
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={config.enableImageCleaning}
                onChange={(e) => setConfig((c) => ({ ...c, enableImageCleaning: e.target.checked }))}
                disabled={isRunning}
              />
              <span className="text-sm">启用图片清洗</span>
            </label>
            <label className="block text-sm text-gray-600 mt-2">输出类型</label>
            <select
              value={config.outputType}
              onChange={(e) =>
                setConfig((c) => ({ ...c, outputType: e.target.value as 'html' | 'image' | 'both' }))
              }
              disabled={isRunning}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="html">仅 HTML</option>
              <option value="image">仅图片</option>
              <option value="both">HTML + 图片</option>
            </select>
            {(config.outputType === 'html' || config.outputType === 'both') && (
              <>
                <label className="block text-sm text-gray-600 mt-2">HTML 生成模型</label>
                <select
                  value={config.htmlModel ?? defaultChatModel}
                  onChange={(e) => setConfig((c) => ({ ...c, htmlModel: e.target.value }))}
                  disabled={isRunning}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {chatModelList.length > 0
                    ? chatModelList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))
                    : <option value={defaultChatModel}>{defaultChatModel}</option>}
                </select>
              </>
            )}
            <label className="block text-sm text-gray-600 mt-2">图片生成模型</label>
            <select
              value={config.imageModel ?? 'Doubao-image-seedream-v4.5'}
              onChange={(e) => {
                const model = e.target.value;
                setConfig((c) => ({
                  ...c,
                  imageModel: model,
                  imageSize: model.includes('Doubao') ? '2K' : '1K',
                }));
              }}
              disabled={isRunning}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="Doubao-image-seedream-v4.5">Doubao (推荐)</option>
              <option value="gemini-3-pro-image-preview">Gemini</option>
            </select>
            <label className="block text-sm text-gray-600 mt-2">任务间隔 (ms)</label>
            <input
              type="number"
              min={0}
              value={config.taskDelayMs ?? 2000}
              onChange={(e) =>
                setConfig((c) => ({ ...c, taskDelayMs: parseInt(e.target.value, 10) || 0 }))
              }
              disabled={isRunning}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <button
              type="button"
              onClick={handleRun}
              disabled={isRunning || parsedItems.length === 0}
              className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? `运行中 ${currentTask.index}/${currentTask.total}…` : '开始批量测试'}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-white rounded-lg border border-gray-200">
          <h2 className="font-semibold text-gray-800 p-3 border-b border-gray-200">运行日志</h2>
          <pre className="flex-1 overflow-auto p-4 text-xs text-gray-700 font-mono whitespace-pre-wrap break-words">
            {logs.length === 0 ? '上传 Excel 并点击「开始批量测试」后，此处将输出每一步记录。' : logs.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
};
