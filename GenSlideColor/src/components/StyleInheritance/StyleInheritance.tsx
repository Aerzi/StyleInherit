import React, { useState, useRef, useEffect, useCallback } from 'react';
import { extractStyleFromImage } from '../../keepstyle/extractStyleService';
import { generateSlide } from '../../keepstyle/generateService';
import { cleanImage, imageUrlToBase64 } from '../../keepstyle/cleanImageService';
import { fetchModels, type ModelInfo } from '../../services/llmService';
import { fileToBase64 } from '../../keepstyle/utils';
import type { StyleExtractResult, GenerateResult } from '../../keepstyle/types';
import { getTemplateList, loadTemplateById, type HtmlTemplateInfo } from '../../assets/template/templateLoader';

// 预填内容选项
const PRESET_PROMPTS = [
  { id: 1, label: '2025年度汇报', content: '2025年度汇报' },
  { id: 2, label: '少儿教育创意绘画', content: '我的主题需要切换为少儿教育/创意绘画相关，主要着重于教育发展与实行，要求：明亮的柠檬黄与天蓝色对比。中心区留白，边缘装饰有不规则的、具有水粉涂鸦质感的几何块，圆角半径设定为 40pts，体现极高的亲和力。' },
  { id: 3, label: 'Q4财务报表分析', content: '请生成一份2024年Q4财务报表分析，包含过去5个季度的营收、净利润、毛利率对比，以及分地区的销售数据（华东、华南、华北、西南、西北），并以表格形式展示具体数值。' },
];

// 历史记录类型
interface HistoryRecord {
  id: string;
  timestamp: number;
  prompt: string;
  outputType: 'html' | 'image' | 'both';
  html?: string;
  imageUrl?: string;
  templateId?: number | string;  // 支持数字ID和字符串ID（如 ns-text）
}

// localStorage key
const HISTORY_STORAGE_KEY = 'style-inheritance-history';

const StyleInheritance: React.FC = () => {
  // State
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Configuration State
  const [generateUserPrompt, setGenerateUserPrompt] = useState('');
  const [outputType, setOutputType] = useState<'html' | 'image' | 'both'>('html');
  const [selectedHtmlTemplateId, setSelectedHtmlTemplateId] = useState<number | string>('');
  const [selectedHtmlTemplateContent, setSelectedHtmlTemplateContent] = useState<string>('');
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  const [imageSize] = useState<'1K' | '2K' | '4K'>('1K');
  
  // 当 outputType 为 'both' 时，用于切换预览的 HTML 或图片
  const [previewTab, setPreviewTab] = useState<'html' | 'image'>('html');

  // 是否启用样式提取（解耦开关）
  const [enableStyleExtract, setEnableStyleExtract] = useState(true);

  // Process State
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [currentStage, setCurrentStage] = useState<'extracting' | 'cleaning' | 'generating' | 'auditing' | ''>('');
  
  // 图片清洗相关状态
  const [enableImageCleaning, setEnableImageCleaning] = useState(false); // 是否启用图片清洗
  const [cleanedImageUrl, setCleanedImageUrl] = useState<string>(''); // 清洗后的图片URL
  const [cleanedImageBase64, setCleanedImageBase64] = useState<string>(''); // 清洗后的图片Base64
  const [cleaningProgress, setCleaningProgress] = useState(0); // 清洗进度
  const [useCleanedImageForGenerate, setUseCleanedImageForGenerate] = useState(true); // 生成时是否使用清洗后的图片
  
  // Result State
  const [extractedStyle, setExtractedStyle] = useState<StyleExtractResult | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [extractStreamContent, setExtractStreamContent] = useState('');
  const [generateStreamContent, setGenerateStreamContent] = useState('');

  // Refs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Preview Scale State
  const [previewScale, setPreviewScale] = useState(1);

  // Models State：样式提取 / 生成HTML / 图片生成 / 图片清洗 分别选模型
  const [selectedExtractModel, setSelectedExtractModel] = useState('kimi-k2.5');
  const [selectedHtmlModel, setSelectedHtmlModel] = useState('kimi-k2.5');
  const [selectedImageModel, setSelectedImageModel] = useState('Doubao-image-seedream-v4.5');
  const [selectedCleanImageModel, setSelectedCleanImageModel] = useState('Doubao-image-seedream-v4.5');
  const [modelList, setModelList] = useState<ModelInfo[]>([]);

  // 图片相关模型列表（生成、清洗共用）
  const imageModelList = [
    { id: 'Doubao-image-seedream-v4.5', name: 'Doubao (16:9 高清)', provider: 'doubao' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini (1:1 方形)', provider: 'google' },
  ];

  // Template List State
  const [templateList, setTemplateList] = useState<HtmlTemplateInfo[]>([]);

  // 历史记录状态
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [showInputPreview, setShowInputPreview] = useState(false);
  const [showCleanedImagePreview, setShowCleanedImagePreview] = useState(false);

  const isProcessing = isExtracting || isGenerating || isCleaning;

  // 计算预览缩放比例
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const calculateScale = () => {
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      // 原始尺寸 1280x720
      const scaleX = containerWidth / 1280;
      const scaleY = containerHeight / 720;
      const scale = Math.min(scaleX, scaleY, 1); // 最大缩放比例为1
      setPreviewScale(scale);
    };

    calculateScale();

    const resizeObserver = new ResizeObserver(calculateScale);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [result?.html]);

  // Effects
  useEffect(() => {
    const loadModels = async () => {
      try {
        const models = await fetchModels();
        if (!models.find(m => m.id === 'kimi-k2.5')) {
          models.unshift({ id: 'kimi-k2.5', object: 'model', created: Date.now() });
        }
        setModelList(models);
      } catch (error) {
        console.error('Failed to load models', error);
      }
    };
    loadModels();
  }, []);

  // Load local templates
  useEffect(() => {
    const templates = getTemplateList();
    setTemplateList(templates);
  }, []);

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const records = JSON.parse(stored) as HistoryRecord[];
        setHistoryRecords(records);
      }
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = useCallback((record: Omit<HistoryRecord, 'id' | 'timestamp'>) => {
    const newRecord: HistoryRecord = {
      ...record,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    setHistoryRecords(prev => {
      const updated = [newRecord, ...prev].slice(0, 50); // 最多保存50条
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history:', e);
      }
      return updated;
    });
  }, []);

  // Delete history record
  const deleteHistoryRecord = useCallback((id: string) => {
    setHistoryRecords(prev => {
      const updated = prev.filter(r => r.id !== id);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save history:', e);
      }
      return updated;
    });
  }, []);

  // Clear all history
  const clearAllHistory = useCallback(() => {
    setHistoryRecords([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear history:', e);
    }
  }, []);

  // Load history record to preview
  const loadHistoryRecord = useCallback((record: HistoryRecord) => {
    setResult({
      html: record.html,
      imageUrl: record.imageUrl,
      success: true,
    });
    setGenerateUserPrompt(record.prompt);
    if (record.outputType === 'both') {
      setPreviewTab(record.html ? 'html' : 'image');
    }
    setShowHistory(false);
  }, []);

  // Handlers
  const loadImages = useCallback(async (files: File[]) => {
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        newFiles.push(file);
        const base64 = await fileToBase64(file);
        newPreviews.push(base64);
      }
    }
    
    setImageFiles(prev => [...prev, ...newFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);
  }, []);

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    await loadImages(files);
  };

  // Paste Support
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        e.preventDefault();
        await loadImages(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [loadImages]);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    await loadImages(files.filter(f => f.type.startsWith('image/')));
  };

  const removeImage = (index: number) => {
    const newFiles = [...imageFiles];
    const newPreviews = [...imagePreviews];
    newFiles.splice(index, 1);
    newPreviews.splice(index, 1);
    setImageFiles(newFiles);
    setImagePreviews(newPreviews);
  };

  // 单独执行样式提取
  const handleExtractStyle = async () => {
    if (imageFiles.length === 0) return;

    setIsExtracting(true);
    setCurrentStage('extracting');
    setExtractedStyle(null);
    setExtractStreamContent('');

    try {
      const currentImageBase64s = await Promise.all(imageFiles.map(fileToBase64));
      
      const style = await extractStyleFromImage(
        {
          imageBase64s: currentImageBase64s,
          userPrompt: generateUserPrompt,
          model: selectedExtractModel,
        },
        {
          onStreamContent: (content) => setExtractStreamContent(content),
          onError: (err) => console.error('Extraction warning:', err),
        }
      );
      
      setExtractedStyle(style);
      
      // 如果启用了图片清洗，在样式提取后自动执行清洗
      if (enableImageCleaning && style.styleDescription) {
        await handleCleanImage(currentImageBase64s[0], style.styleDescription);
      }
    } catch (error) {
      console.error('Extract failed:', error);
    } finally {
      setIsExtracting(false);
      setCurrentStage('');
    }
  };

  // 图片清洗处理函数
  const handleCleanImage = async (originalBase64?: string, styleDesc?: string) => {
    const imageBase64 = originalBase64 || (imageFiles.length > 0 ? await fileToBase64(imageFiles[0]) : null);
    const styleDescription = styleDesc || extractedStyle?.styleDescription;
    
    if (!imageBase64 || !styleDescription) {
      console.error('清洗图片需要原始图片和样式描述');
      return;
    }

    setIsCleaning(true);
    setCurrentStage('cleaning');
    setCleaningProgress(0);
    setCleanedImageUrl('');
    setCleanedImageBase64('');

    try {
      const result = await cleanImage(
        {
          originalImageBase64: imageBase64,
          styleDescription: styleDescription,
          imageModel: selectedCleanImageModel,
        },
        {
          onProgress: (stage, progress) => {
            setCleaningProgress(progress);
          },
          onError: (err) => console.error('清洗错误:', err),
        }
      );

      setCleanedImageUrl(result.cleanedImageUrl);
      
      // 将清洗后的图片转换为 base64 以便后续使用
      try {
        const base64 = await imageUrlToBase64(result.cleanedImageUrl);
        setCleanedImageBase64(base64);
      } catch (e) {
        console.warn('清洗后图片转 base64 失败，将使用 URL', e);
      }
    } catch (error) {
      console.error('图片清洗失败:', error);
    } finally {
      setIsCleaning(false);
      setCurrentStage('');
      setCleaningProgress(100);
    }
  };

  // 独立图片清洗功能 - 直接清洗，不提取样式
  const handleStandaloneCleanImage = async () => {
    if (imageFiles.length === 0) return;

    setIsCleaning(true);
    setCurrentStage('cleaning');
    setCleaningProgress(0);
    setCleanedImageUrl('');
    setCleanedImageBase64('');

    try {
      // 获取图片的 base64
      const imageBase64 = await fileToBase64(imageFiles[0]);
      
      // 使用已有的样式描述，如果没有则使用默认的通用描述
      const styleDescription = extractedStyle?.styleDescription || 
        '请根据上传的参考图片，完整保留其背景色、渐变、边缘装饰元素、材质质感和色彩体系，去除所有文字、图表、3D元素和具体内容图像，生成一张纯净的幻灯片背景。';
      
      // 执行图片清洗
      const cleanResult = await cleanImage(
        {
          originalImageBase64: imageBase64,
          styleDescription: styleDescription,
          imageModel: selectedCleanImageModel,
        },
        {
          onProgress: (stage, progress) => {
            setCleaningProgress(progress);
          },
          onError: (err) => console.error('清洗错误:', err),
        }
      );

      setCleanedImageUrl(cleanResult.cleanedImageUrl);
      
      // 将清洗后的图片转换为 base64 以便后续使用
      try {
        const base64 = await imageUrlToBase64(cleanResult.cleanedImageUrl);
        setCleanedImageBase64(base64);
      } catch (e) {
        console.warn('清洗后图片转 base64 失败，将使用 URL', e);
      }
      
      setCleaningProgress(100);
    } catch (error) {
      console.error('独立图片清洗失败:', error);
    } finally {
      setIsCleaning(false);
      setCurrentStage('');
    }
  };

  // 单独执行内容生成
  const handleGenerate = async () => {
    setIsGenerating(true);
    setCurrentStage('generating');
    setResult(null);
    setGenerateStreamContent('');

    // 对于 'both' 模式，使用 HTML 的尺寸（图片尺寸在 generateService 中单独处理）
    const needsHtml = outputType === 'html' || outputType === 'both';
    const width = needsHtml ? 1280 : 3600;
    const height = needsHtml ? 720 : 2025;

    let refImageBase64s: string[] | undefined = undefined;
    if (imageFiles.length > 0) {
      // 如果启用了图片清洗且有清洗后的图片，优先使用清洗后的图片
      if (enableImageCleaning && useCleanedImageForGenerate && cleanedImageBase64) {
        refImageBase64s = [cleanedImageBase64];
        console.log('[Generate] 使用清洗后的图片');
      } else {
        refImageBase64s = await Promise.all(imageFiles.map(fileToBase64));
        console.log('[Generate] 使用原始图片');
      }
    }

    // 根据模式确定提示词策略
    // - 如果启用了样式提取且有提取结果，使用 style_extract 模式
    // - 如果关闭了样式提取但有图片，使用 image_reference 模式（直接参考图片）
    // - 如果没有图片，使用 text 模式
    let promptMode: 'text' | 'style_extract' | 'image_reference' = 'text';
    
    if (enableStyleExtract && extractedStyle?.styleDescription) {
      // 已提取样式，使用样式提取模式
      promptMode = 'style_extract';
    } else if (!enableStyleExtract && refImageBase64s && refImageBase64s.length > 0) {
      // 关闭样式提取但有图片，使用图片直接参考模式
      promptMode = 'image_reference';
    } else if (refImageBase64s && refImageBase64s.length > 0) {
      // 有图片但没有提取样式（可能提取失败），使用图片直接参考模式
      promptMode = 'image_reference';
    }
    
    // 使用提取的样式描述，如果没有则使用默认
    const styleDescription = extractedStyle?.styleDescription || '请根据用户需求生成一张高质量的幻灯片。';
    
    // 用户输入，如果为空则使用默认主题
    const DEFAULT_USER_PROMPT = '2025年产品年度总结，详细说明本年度各季度的收益与亏损，集中于产品视角分析';
    const userPrompt = generateUserPrompt.trim() || DEFAULT_USER_PROMPT;

    // 判断是否需要 HTML 和图片相关参数
    const needsImage = outputType === 'image' || outputType === 'both';

    try {
      const generateResult = await generateSlide(
        {
          styleDescription,
          userPrompt,
          model: needsHtml ? selectedHtmlModel : undefined,
          imageModel: needsImage ? selectedImageModel : undefined,
          outputType,
          imageSize: needsImage ? imageSize : undefined,
          width,
          height,
          htmlTemplate: needsHtml && selectedHtmlTemplateId ? selectedHtmlTemplateContent : undefined,
          imageBase64s: refImageBase64s,
          promptMode // 传递提示词模式
        },
        {
          onStreamContent: (content) => setGenerateStreamContent(content),
          onError: (err) => console.error('Generation error:', err),
        }
      );
      
      setResult(generateResult);
      
      // 保存到历史记录
      if (generateResult.success && (generateResult.html || generateResult.imageUrl)) {
        saveToHistory({
          prompt: userPrompt,
          outputType,
          html: generateResult.html,
          imageUrl: generateResult.imageUrl,
          templateId: selectedHtmlTemplateId,
        });
      }
    } catch (error) {
      console.error('Generation failed:', error);
    } finally {
      setIsGenerating(false);
      setCurrentStage('');
    }
  };

  // 一键执行（提取+生成）
  const handleGenerateAll = async () => {
    if (enableStyleExtract && imageFiles.length > 0) {
      // 先提取样式
      await handleExtractStyle();
    }
    // 再生成内容
    await handleGenerate();
  };

  const handleTemplateSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rawValue = e.target.value;
    
    // 处理数字ID和字符串ID两种情况
    // 数字ID: "1", "2", "3" 等
    // 字符串ID: "ns-text", "ns-table", "ns-timeline" 等
    let id: number | string = '';
    if (rawValue) {
      const numValue = Number(rawValue);
      // 如果能转成有效数字则用数字，否则用原始字符串
      id = !isNaN(numValue) && rawValue.match(/^\d+$/) ? numValue : rawValue;
    }
    
    setSelectedHtmlTemplateId(id);
    if (!id) {
      setSelectedHtmlTemplateContent('');
      return;
    }

    setIsTemplateLoading(true);
    try {
      const content = await loadTemplateById(id);
      if (content) {
        setSelectedHtmlTemplateContent(content);
      } else {
        setSelectedHtmlTemplateContent('');
        console.warn(`Template ${id} not found`);
      }
    } catch (err) {
      console.error('Failed to load template', err);
      setSelectedHtmlTemplateContent('');
    } finally {
      setIsTemplateLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Copy failed', err);
    }
  };

  const downloadHtml = () => {
    if (!result?.html) return;
    const blob = new Blob([result.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slide.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 overflow-hidden text-slate-800">
      {/* Header */}
      <header className="px-8 py-4 bg-white border-b border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              🎨 样式保持生成
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">上传图片提取样式基因，基于视觉特征生成高保真幻灯片</p>
          </div>
          <div className="flex items-center gap-4">
            {/* 历史记录按钮 */}
            <button
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              📋 历史记录
              {historyRecords.length > 0 && (
                <span className="bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">
                  {historyRecords.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Configuration */}
          <div className="w-[380px] shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
            <div className="p-5 flex flex-col gap-5">
              
              {/* Image Upload */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <span>📷</span> 上传参考图片
                  <span className="text-xs font-normal text-slate-400 ml-auto">支持粘贴</span>
                </label>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                />
                
                {imagePreviews.length === 0 ? (
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all
                      ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}
                    `}
                    onClick={() => imageInputRef.current?.click()}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="text-3xl mb-2 opacity-40">🖼️</div>
                    <p className="text-sm text-slate-500">点击或拖拽上传</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative aspect-video rounded-md overflow-hidden border border-slate-200 group">
                        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                        <button
                          onClick={() => removeImage(index)}
                          className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => imageInputRef.current?.click()}
                      className="aspect-video rounded-md border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all text-xl"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>

              {/* User Prompt */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <span>✏️</span> 用户输入
                  </label>
                  {/* 快速预填按钮 */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowPresetMenu(!showPresetMenu)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 px-2 py-1 hover:bg-indigo-50 rounded transition-colors"
                      disabled={isProcessing}
                    >
                      ⚡ 快速填充
                      <span className="text-[10px]">▼</span>
                    </button>
                    
                    {/* 预填菜单 */}
                    {showPresetMenu && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={() => setShowPresetMenu(false)}
                        />
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[200px]">
                          {PRESET_PROMPTS.map(preset => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setGenerateUserPrompt(preset.content);
                                setShowPresetMenu(false);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <textarea
                  value={generateUserPrompt}
                  onChange={(e) => setGenerateUserPrompt(e.target.value)}
                  className="w-full p-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none h-20 bg-white"
                  placeholder="例如：创建一个关于2026年人工智能发展趋势的幻灯片..."
                  disabled={isProcessing}
                />
              </div>

              {/* Style Extract Toggle */}
              <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">🎨 启用样式提取</span>
                  <span className="text-xs text-slate-400">(从图片中提取视觉风格)</span>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={enableStyleExtract}
                    onChange={(e) => setEnableStyleExtract(e.target.checked)}
                    disabled={isProcessing}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 peer-disabled:opacity-50 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-5"></div>
                </div>
              </label>

              {/* Image Cleaning Toggle - 仅在启用样式提取时显示 */}
              {enableStyleExtract && (
                <div className="flex flex-col gap-2 p-3 bg-amber-50/50 rounded-lg border border-amber-200">
                  <label className="flex items-center justify-between cursor-pointer select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-amber-700">🧹 启用图片清洗</span>
                      <span className="text-xs text-amber-600">(生成去除噪点的纯净背景)</span>
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={enableImageCleaning}
                        onChange={(e) => setEnableImageCleaning(e.target.checked)}
                        disabled={isProcessing}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-amber-200 rounded-full peer peer-checked:bg-amber-500 peer-disabled:opacity-50 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-5"></div>
                    </div>
                  </label>
                  
                  {/* 清洗后使用开关 */}
                  {enableImageCleaning && cleanedImageUrl && (
                    <label className="flex items-center gap-2 text-xs text-amber-600 cursor-pointer ml-1">
                      <input
                        type="checkbox"
                        checked={useCleanedImageForGenerate}
                        onChange={(e) => setUseCleanedImageForGenerate(e.target.checked)}
                        disabled={isProcessing}
                        className="w-3.5 h-3.5 rounded text-amber-500 focus:ring-amber-500"
                      />
                      <span>生成时使用清洗后的图片</span>
                    </label>
                  )}
                  
                  {/* 清洗进度或预览 */}
                  {isCleaning && (
                    <div className="flex items-center gap-2 text-xs text-amber-600">
                      <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin"></div>
                      <span>正在清洗图片... {cleaningProgress}%</span>
                    </div>
                  )}
                  
                  {cleanedImageUrl && !isCleaning && (
                    <div className="flex items-center gap-2">
                      <div 
                        className="relative w-16 h-9 rounded overflow-hidden border border-amber-300 cursor-pointer hover:ring-2 hover:ring-amber-400 transition-all group"
                        onClick={() => setShowCleanedImagePreview(true)}
                        title="点击放大预览"
                      >
                        <img src={cleanedImageUrl} alt="Cleaned" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                          <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">🔍</span>
                        </div>
                      </div>
                      <div className="flex-1 text-xs text-amber-600">
                        ✓ 清洗完成，已生成纯净背景
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCleanImage()}
                        disabled={isProcessing}
                        className="text-xs text-amber-700 hover:text-amber-900 hover:underline"
                      >
                        重新清洗
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Configuration Fields */}
              <div className="flex flex-col gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">样式提取模型</label>
                  <select
                    value={selectedExtractModel}
                    onChange={(e) => setSelectedExtractModel(e.target.value)}
                    className="w-full p-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                    disabled={isProcessing}
                  >
                    {modelList.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">生成 HTML 模型</label>
                  <select
                    value={selectedHtmlModel}
                    onChange={(e) => setSelectedHtmlModel(e.target.value)}
                    className="w-full p-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                    disabled={isProcessing}
                  >
                    {modelList.map(m => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">图片生成模型</label>
                  <select
                    value={selectedImageModel}
                    onChange={(e) => setSelectedImageModel(e.target.value)}
                    disabled={isProcessing}
                    className="w-full p-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {imageModelList.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    {selectedImageModel === 'Doubao-image-seedream-v4.5' ? '豆包：3600×2025 16:9' : 'Gemini：1024×1024 方形'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">图片清洗模型</label>
                  <select
                    value={selectedCleanImageModel}
                    onChange={(e) => setSelectedCleanImageModel(e.target.value)}
                    disabled={isProcessing}
                    className="w-full p-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                  >
                    {imageModelList.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-600">生成模式</label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="html"
                        checked={outputType === 'html'}
                        onChange={() => setOutputType('html')}
                        className="w-4 h-4 text-indigo-600"
                        disabled={isProcessing}
                      />
                      <span className="text-sm text-slate-600">HTML</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="image"
                        checked={outputType === 'image'}
                        onChange={() => setOutputType('image')}
                        className="w-4 h-4 text-indigo-600"
                        disabled={isProcessing}
                      />
                      <span className="text-sm text-slate-600">图片</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        value="both"
                        checked={outputType === 'both'}
                        onChange={() => setOutputType('both')}
                        className="w-4 h-4 text-purple-600"
                        disabled={isProcessing}
                      />
                      <span className="text-sm text-purple-600 font-medium">HTML + 图片</span>
                    </label>
                  </div>
                </div>

                {(outputType === 'html' || outputType === 'both') && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">参考模板</label>
                    <select
                      value={selectedHtmlTemplateId}
                      onChange={handleTemplateSelect}
                      disabled={isProcessing}
                      className="w-full p-2 rounded-md border border-slate-300 text-sm bg-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">不使用模板</option>
                      {templateList.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.id}. {t.name} - {t.description}
                        </option>
                      ))}
                    </select>
                    {isTemplateLoading && <span className="text-xs text-indigo-500 animate-pulse">加载中...</span>}
                    
                    {/* 模板选择成功提示和预览按钮 */}
                    {selectedHtmlTemplateId && selectedHtmlTemplateContent && !isTemplateLoading && (
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          ✓ 模板加载成功
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowTemplatePreview(true)}
                          className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
                        >
                          预览模板 →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                {/* 分步按钮 */}
                <div className="flex gap-2">
                  <button
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all
                      ${imageFiles.length === 0 || isProcessing || !enableStyleExtract
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                        : 'bg-white border border-indigo-500 text-indigo-600 hover:bg-indigo-50'}
                    `}
                    disabled={imageFiles.length === 0 || isProcessing || !enableStyleExtract}
                    onClick={handleExtractStyle}
                  >
                    {isExtracting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin"></div>
                        <span>提取中...</span>
                      </>
                    ) : (
                      <span>🎨 提取样式</span>
                    )}
                  </button>
                  <button
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all
                      ${isProcessing
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                        : 'bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50'}
                    `}
                    disabled={isProcessing}
                    onClick={handleGenerate}
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-600 rounded-full animate-spin"></div>
                        <span>生成中...</span>
                      </>
                    ) : (
                      <span>🖼️ 生成内容</span>
                    )}
                  </button>
                </div>

                {/* 一键按钮 */}
                <button
                  className={`w-full py-3 px-6 rounded-lg text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all
                    ${isProcessing 
                      ? 'bg-slate-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-lg hover:from-indigo-500 hover:to-purple-500'}
                  `}
                  disabled={isProcessing}
                  onClick={handleGenerateAll}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>{currentStage === 'extracting' ? '正在提取样式...' : currentStage === 'cleaning' ? '正在清洗图片...' : '正在生成内容...'}</span>
                    </>
                  ) : (
                    <span>🚀 一键生成 {enableStyleExtract ? '(提取 + 生成)' : '(仅生成)'}</span>
                  )}
                </button>
              </div>

              {/* 独立图片清洗功能区 */}
              <div className="flex flex-col gap-3 p-4 bg-gradient-to-br from-cyan-50 to-teal-50 rounded-lg border border-cyan-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🧹</span>
                    <span className="text-sm font-semibold text-cyan-800">图片清洗</span>
                  </div>
                  <span className="text-xs text-cyan-600">生成纯净背景图</span>
                </div>
                
                <p className="text-xs text-cyan-700 leading-relaxed">
                  上传一张图片，自动提取样式并清洗生成一张去除文字、图表等噪点的纯净背景。
                </p>

                {/* 清洗结果预览 */}
                {cleanedImageUrl && !isCleaning && (
                  <div className="flex items-start gap-3 p-3 bg-white/60 rounded-lg border border-cyan-200">
                    <div 
                      className="relative w-24 h-[54px] rounded-md overflow-hidden border border-cyan-300 shadow-sm shrink-0 cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all group"
                      onClick={() => setShowCleanedImagePreview(true)}
                      title="点击放大预览"
                    >
                      <img src={cleanedImageUrl} alt="Cleaned Background" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all">
                        <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">🔍</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-cyan-800 mb-1">✓ 清洗完成</div>
                      <div className="flex flex-wrap gap-2">
                        <a 
                          href={cleanedImageUrl}
                          download="cleaned-background.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-white bg-cyan-600 hover:bg-cyan-700 px-2 py-1 rounded transition-colors"
                        >
                          💾 下载
                        </a>
                        <button
                          onClick={() => {
                            if (cleanedImageUrl) {
                              navigator.clipboard.writeText(cleanedImageUrl);
                            }
                          }}
                          className="text-xs text-cyan-700 hover:text-cyan-900 px-2 py-1 hover:bg-cyan-100 rounded transition-colors"
                        >
                          📋 复制URL
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 清洗进度条 */}
                {isCleaning && (
                  <div className="flex flex-col gap-2 p-3 bg-white/60 rounded-lg border border-cyan-200">
                    <div className="flex items-center gap-2 text-xs text-cyan-700">
                      <div className="w-4 h-4 border-2 border-cyan-300 border-t-cyan-600 rounded-full animate-spin"></div>
                      <span>正在清洗图片... {cleaningProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-cyan-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-300 ease-out"
                        style={{ width: `${cleaningProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 清洗按钮 */}
                <button
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all
                    ${imageFiles.length === 0 || isCleaning
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-md hover:shadow-lg'}
                  `}
                  disabled={imageFiles.length === 0 || isCleaning}
                  onClick={handleStandaloneCleanImage}
                >
                  {isCleaning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>清洗中...</span>
                    </>
                  ) : (
                    <span>🧹 单独清洗背景</span>
                  )}
                </button>
                
                {imageFiles.length === 0 && (
                  <p className="text-xs text-cyan-600 text-center">请先上传一张参考图片</p>
                )}
              </div>

            </div>
          </div>

          {/* Right Panel: Preview */}
          <div className="flex-1 bg-slate-100 flex flex-col overflow-hidden">
            {!extractStreamContent && !extractedStyle && !generateStreamContent && !result ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
                <div className="text-5xl opacity-30">🎨</div>
                <p className="text-base font-medium">准备就绪</p>
                <p className="text-sm">上传图片并点击生成按钮以查看结果</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Style Extraction Result Panel */}
                {(extractStreamContent || extractedStyle) && (
                  <div className="shrink-0 border-b border-slate-200 bg-white">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <span className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                        🎨 样式提取结果
                        {isExtracting && <span className="text-xs text-indigo-500 animate-pulse">(提取中...)</span>}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-mono">
                          {(extractedStyle?.styleDescription || extractStreamContent).length} 字符
                        </span>
                        <button 
                          onClick={() => copyToClipboard(extractedStyle?.styleDescription || extractStreamContent)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 hover:bg-indigo-50 rounded"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto p-4 bg-slate-900">
                      <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                        {extractedStyle?.styleDescription || extractStreamContent}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Generation Result Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="px-4 py-2 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                      <h3 className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                        🖼️ 生成结果
                        {isGenerating && <span className="text-xs text-emerald-500 animate-pulse">(生成中...)</span>}
                      </h3>
                      
                      {/* 当同时生成 HTML 和图片时，显示切换标签 */}
                      {outputType === 'both' && (result?.html || result?.imageUrl) && (
                        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md">
                          <button
                            onClick={() => setPreviewTab('html')}
                            className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                              previewTab === 'html' 
                                ? 'bg-white text-indigo-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            📄 HTML {result?.html && '✓'}
                          </button>
                          <button
                            onClick={() => setPreviewTab('image')}
                            className={`px-3 py-1 text-xs font-medium rounded transition-all ${
                              previewTab === 'image' 
                                ? 'bg-white text-purple-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            🖼️ 图片 {result?.imageUrl && '✓'}
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex gap-2">
                      {/* 查看输入按钮 */}
                      {(result?.html || result?.imageUrl) && (
                        <button 
                          onClick={() => setShowInputPreview(true)}
                          className="px-3 py-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100 transition-colors"
                        >
                          📝 查看输入
                        </button>
                      )}
                      
                      {result?.html && (outputType === 'html' || outputType === 'both') && (
                        <>
                          <button 
                            onClick={() => copyToClipboard(result.html || '')}
                            className="px-3 py-1 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                          >
                            复制代码
                          </button>
                          <button 
                            onClick={downloadHtml}
                            className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                          >
                            下载 HTML
                          </button>
                        </>
                      )}
                      {result?.imageUrl && (outputType === 'image' || outputType === 'both') && (
                        <a 
                          href={result.imageUrl}
                          download="slide.png"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors"
                        >
                          下载图片
                        </a>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex-1 bg-slate-200 flex items-center justify-center p-4 overflow-hidden">
                    {/* 根据 outputType 和 previewTab 决定显示内容 */}
                    {(() => {
                      // 确定当前要显示的类型
                      const showType = outputType === 'both' ? previewTab : outputType;
                      
                      if (showType === 'html') {
                        return result?.html ? (
                          // 16:9 固定比例预览，内容按比例缩放完整展示
                          <div 
                            ref={previewContainerRef}
                            className="w-full h-full flex items-center justify-center"
                          >
                            <div 
                              className="relative bg-white shadow-2xl rounded-lg overflow-hidden"
                              style={{
                                width: `${1280 * previewScale}px`,
                                height: `${720 * previewScale}px`,
                              }}
                            >
                              <div 
                                className="absolute top-0 left-0 origin-top-left"
                                style={{
                                  width: '1280px',
                                  height: '720px',
                                  transform: `scale(${previewScale})`,
                                }}
                              >
                                <iframe 
                                  srcDoc={result.html} 
                                  className="w-full h-full border-none bg-white"
                                  title="Preview"
                                />
                              </div>
                            </div>
                          </div>
                        ) : generateStreamContent ? (
                          <div className="w-full h-full bg-slate-900 rounded-lg p-4 overflow-auto">
                            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                              {generateStreamContent}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-sm">等待 HTML 生成...</div>
                        );
                      } else {
                        return result?.imageUrl ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <img 
                              src={result.imageUrl} 
                              alt="Generated Slide" 
                              className="max-w-full max-h-full object-contain rounded-lg shadow-xl" 
                              style={{ aspectRatio: '16 / 9' }}
                            />
                          </div>
                        ) : generateStreamContent ? (
                          <div className="w-full h-full bg-slate-900 rounded-lg p-4 overflow-auto">
                            <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap">
                              {generateStreamContent || '等待图片生成...'}
                            </pre>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-sm">等待图片生成...</div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      {/* 模板预览模态框 */}
      {showTemplatePreview && selectedHtmlTemplateContent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowTemplatePreview(false)}
        >
          <div 
            className="relative bg-white rounded-xl shadow-2xl overflow-hidden"
            style={{ width: '90vw', maxWidth: '1400px' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 模态框头部 */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <span className="text-lg font-semibold text-slate-800">📄 模板预览</span>
                <span className="text-sm text-slate-500">
                  {templateList.find(t => t.id === selectedHtmlTemplateId)?.name || `模板 ${selectedHtmlTemplateId}`}
                </span>
              </div>
              <button
                onClick={() => setShowTemplatePreview(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* 模板内容预览 - 16:9 比例 */}
            <div className="p-6 bg-slate-200 flex items-center justify-center" style={{ maxHeight: '75vh' }}>
              <div 
                className="relative bg-white shadow-xl rounded-lg overflow-hidden"
                style={{
                  width: 'min(100%, calc(75vh * 16 / 9))',
                  aspectRatio: '16 / 9',
                }}
              >
                <iframe 
                  srcDoc={selectedHtmlTemplateContent} 
                  className="w-full h-full border-none"
                  title="Template Preview"
                  style={{
                    transform: 'scale(1)',
                    transformOrigin: 'top left',
                  }}
                />
              </div>
            </div>
            
            {/* 模态框底部 */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => setShowTemplatePreview(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowTemplatePreview(false);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                确认使用此模板
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 输入预览模态框 */}
      {showInputPreview && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowInputPreview(false)}
        >
          <div 
            className="relative bg-white rounded-xl shadow-2xl overflow-hidden max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 bg-amber-50 border-b border-amber-200">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-amber-800">📝 输入内容预览</span>
              </div>
              <button
                onClick={() => setShowInputPreview(false)}
                className="w-8 h-8 flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>
            
            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 用户输入文本 */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span>✏️</span> 用户主题输入
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {generateUserPrompt || <span className="text-slate-400 italic">（使用默认主题：2025年产品年度总结...）</span>}
                  </p>
                </div>
              </div>

              {/* 参考图片 */}
              {imagePreviews.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <span>📷</span> 上传的参考图片 ({imagePreviews.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        <img src={preview} alt={`参考图片 ${index + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                          图片 {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 提取的样式 */}
              {extractedStyle?.styleDescription && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <span>🎨</span> 提取的样式描述
                  </h4>
                  <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                      {extractedStyle.styleDescription}
                    </pre>
                  </div>
                </div>
              )}

              {/* 选择的模板 */}
              {selectedHtmlTemplateId && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <span>📄</span> 使用的参考模板
                  </h4>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm text-slate-600">
                      {templateList.find(t => t.id === selectedHtmlTemplateId)?.name || `模板 ${selectedHtmlTemplateId}`}
                      {' - '}
                      {templateList.find(t => t.id === selectedHtmlTemplateId)?.description}
                    </span>
                    <button
                      onClick={() => {
                        setShowInputPreview(false);
                        setShowTemplatePreview(true);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      预览模板 →
                    </button>
                  </div>
                </div>
              )}

              {/* 生成配置 */}
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span>⚙️</span> 生成配置
                </h4>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">输出类型</span>
                    <span className="text-slate-700 font-medium">
                      {outputType === 'html' ? 'HTML 代码' : outputType === 'image' ? '图片' : 'HTML + 图片'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">样式提取</span>
                    <span className="text-slate-700 font-medium">
                      {enableStyleExtract ? '已启用' : '未启用'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">样式提取模型</span>
                    <span className="text-slate-700 font-medium">{selectedExtractModel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">生成HTML模型</span>
                    <span className="text-slate-700 font-medium">{selectedHtmlModel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">图片生成模型</span>
                    <span className="text-slate-700 font-medium">{selectedImageModel}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">图片清洗模型</span>
                    <span className="text-slate-700 font-medium">{selectedCleanImageModel}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* 底部 */}
            <div className="flex items-center justify-end px-6 py-4 bg-slate-50 border-t border-slate-200">
              <button
                onClick={() => setShowInputPreview(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清洗图片放大预览模态框 */}
      {showCleanedImagePreview && cleanedImageUrl && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowCleanedImagePreview(false)}
        >
          <div 
            className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => setShowCleanedImagePreview(false)}
              className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
            >
              ✕
            </button>
            
            {/* 图片 */}
            <div className="relative rounded-xl overflow-hidden shadow-2xl bg-slate-900">
              <img 
                src={cleanedImageUrl} 
                alt="清洗后的背景图片" 
                className="max-w-[90vw] max-h-[80vh] object-contain"
              />
            </div>
            
            {/* 底部操作栏 */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <a 
                href={cleanedImageUrl}
                download="cleaned-background.png"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors shadow-lg"
              >
                💾 下载图片
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(cleanedImageUrl);
                  setShowCleanedImagePreview(false);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/90 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                📋 复制链接
              </button>
              <button
                onClick={() => setShowCleanedImagePreview(false)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white/90 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录侧边栏 */}
      {showHistory && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowHistory(false)}
          />
          
          {/* 侧边栏 */}
          <div className="fixed right-0 top-0 bottom-0 z-50 w-[420px] bg-white shadow-2xl flex flex-col">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-slate-800">📋 历史记录</span>
                <span className="text-xs text-slate-400">({historyRecords.length})</span>
              </div>
              <div className="flex items-center gap-2">
                {historyRecords.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('确定要清空所有历史记录吗？')) {
                        clearAllHistory();
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                  >
                    清空全部
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            
            {/* 记录列表 */}
            <div className="flex-1 overflow-y-auto">
              {historyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <div className="text-4xl mb-3 opacity-30">📭</div>
                  <p className="text-sm">暂无历史记录</p>
                  <p className="text-xs mt-1">生成内容后会自动保存</p>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {historyRecords.map((record) => (
                    <div 
                      key={record.id}
                      className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden hover:border-indigo-300 transition-colors group"
                    >
                      {/* 预览缩略图 */}
                      <div className="relative h-32 bg-slate-200">
                        {record.html ? (
                          <iframe
                            srcDoc={record.html}
                            className="w-full h-full border-none pointer-events-none"
                            style={{ transform: 'scale(0.25)', transformOrigin: 'top left', width: '400%', height: '400%' }}
                            title="Preview"
                          />
                        ) : record.imageUrl ? (
                          <img 
                            src={record.imageUrl} 
                            alt="Preview" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                            无预览
                          </div>
                        )}
                        
                        {/* 类型标签 */}
                        <div className="absolute top-2 left-2">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                            record.outputType === 'html' 
                              ? 'bg-indigo-100 text-indigo-700'
                              : record.outputType === 'image'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {record.outputType === 'html' ? 'HTML' : record.outputType === 'image' ? '图片' : 'HTML+图片'}
                          </span>
                        </div>
                        
                        {/* 删除按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteHistoryRecord(record.id);
                          }}
                          className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        >
                          ✕
                        </button>
                      </div>
                      
                      {/* 信息区域 */}
                      <div className="p-3">
                        <p className="text-xs text-slate-500 mb-1">
                          {new Date(record.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                        <p className="text-sm text-slate-700 line-clamp-2 mb-2">
                          {record.prompt || '无主题描述'}
                        </p>
                        <button
                          onClick={() => loadHistoryRecord(record)}
                          className="w-full py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded hover:bg-indigo-100 transition-colors"
                        >
                          加载此记录
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default StyleInheritance;
