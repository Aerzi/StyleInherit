import React, { useState, useRef, useCallback, useEffect } from 'react';
import { generateSlide } from '../../keepstyle/generateService';
import { generateSinglePageHtmlPpt } from '../../services/llmService';
import { getTemplateList, loadTemplateById, type HtmlTemplateInfo } from '../../assets/template/templateLoader';
import type { PromptMode } from '../../keepstyle/types';

type GenerationMode = 'classic' | 'smart' | 'creative';

interface TemplateOption {
  id: number | string;
  name: string;
  description: string;
}

const MODE_CONFIG: Record<GenerationMode, { title: string; subtitle: string; icon: React.ReactNode }> = {
  classic: {
    title: '经典简约模式',
    subtitle: '基于卡片式布局，适用于通用演示场景，可以灵活调整版式结构',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="3.5" y="8.5" width="6" height="3" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
        <rect x="3.5" y="3.5" width="9" height="3" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
        <rect x="1.5" y="1.5" width="13" height="12" rx="0.5" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    ),
  },
  smart: {
    title: '智能布局模式',
    subtitle: '基于网页生成技术，适用于数据汇报场景，通过多维图表支撑结构化表达',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M5.5 14.5H1.8C1.63 14.5 1.5 14.37 1.5 14.2V7.8C1.5 7.63 1.63 7.5 1.8 7.5H5.5M5.5 14.5V7.5M5.5 14.5H8M10.5 10V5.5M14.5 10V5.8C14.5 5.63 14.37 5.5 14.2 5.5H10.5M10.5 5.5V1.8C10.5 1.63 10.37 1.5 10.2 1.5H5.8C5.63 1.5 5.5 1.63 5.5 1.8V7.5" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M9.5 11.5H14.5M9.5 14.5H14.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  creative: {
    title: '创意设计模式',
    subtitle: '基于图片生成技术，适用于概念展示场景，通过信息架构图讲清复杂概念',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="4.5" cy="7.5" r="1.25" fill="#BF5513" />
        <circle cx="7.5" cy="4.5" r="1.25" fill="currentColor" />
        <circle cx="11" cy="6.5" r="1.25" fill="currentColor" />
        <circle cx="10.5" cy="10.5" r="1.25" fill="currentColor" />
        <path d="M1.54 8C1.88 11.08 5.63 11.08 5.97 11.08C6.57 11.08 7.12 10.99 7.33 11.42C7.6 11.97 7.24 12.63 6.99 13.13C6.65 13.82 6.92 14.5 8.01 14.5C9.38 14.5 14.14 13.82 14.49 8C14.74 3.66 11.59 1.5 8.01 1.5C4.44 1.5 1.09 3.89 1.54 8Z" stroke="currentColor" strokeWidth="1" fill="none" />
      </svg>
    ),
  },
};

const SinglePageGen: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [mode, setMode] = useState<GenerationMode>('smart');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | string | null>(null);
  const [isSmartMatch, setIsSmartMatch] = useState(true);
  const [templateList, setTemplateList] = useState<TemplateOption[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [error, setError] = useState('');

  const [previewScale, setPreviewScale] = useState(1);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const templateScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTemplateList(getTemplateList());
  }, []);

  useEffect(() => {
    if (!generatedHtml || !previewContainerRef.current) return;
    const container = previewContainerRef.current;
    const scaleX = container.clientWidth / 1280;
    const scaleY = container.clientHeight / 720;
    setPreviewScale(Math.min(scaleX, scaleY, 1));
  }, [generatedHtml]);

  const handleGenerate = useCallback(async () => {
    if (!inputText.trim() || isGenerating) return;

    setIsGenerating(true);
    setStreamContent('');
    setGeneratedHtml('');
    setGeneratedImageUrl('');
    setError('');

    try {
      let templateContent: string | null = null;
      const templateIdToLoad = isSmartMatch ? null : selectedTemplateId;
      if (templateIdToLoad) {
        templateContent = await loadTemplateById(templateIdToLoad);
      }

      if (mode === 'classic') {
        const result = await generateSinglePageHtmlPpt(
          {
            prompt: inputText,
            referenceType: templateContent ? 'custom' : 'none',
            customReference: templateContent
              ? { type: 'html', content: templateContent }
              : undefined,
          },
          {
            onStreamContent: setStreamContent,
            onError: (err) => setError(err),
            onComplete: () => {},
          }
        );
        if (result.slides.length > 0) {
          setGeneratedHtml(result.slides[0].html);
        }
      } else if (mode === 'smart') {
        const promptMode: PromptMode = 'text';
        const result = await generateSlide(
          {
            styleDescription: '',
            userPrompt: inputText,
            outputType: 'html',
            promptMode,
            htmlTemplate: templateContent || undefined,
          },
          {
            onStreamContent: setStreamContent,
            onError: (err) => setError(err),
            onComplete: () => {},
          }
        );
        if (result.success && result.html) {
          setGeneratedHtml(result.html);
        } else if (result.error) {
          setError(result.error);
        }
      } else if (mode === 'creative') {
        const result = await generateSlide(
          {
            styleDescription: '',
            userPrompt: inputText,
            outputType: 'image',
            promptMode: 'text',
          },
          {
            onStreamContent: setStreamContent,
            onError: (err) => setError(err),
            onComplete: () => {},
          }
        );
        if (result.success && result.imageUrl) {
          setGeneratedImageUrl(result.imageUrl);
        } else if (result.error) {
          setError(result.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setIsGenerating(false);
    }
  }, [inputText, mode, isSmartMatch, selectedTemplateId, isGenerating]);

  const handleReset = useCallback(() => {
    setGeneratedHtml('');
    setGeneratedImageUrl('');
    setStreamContent('');
    setError('');
  }, []);

  const handleDownloadHtml = useCallback(() => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slide-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedHtml]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  const hasResult = generatedHtml || generatedImageUrl;

  if (hasResult) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 2L4 8L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              返回
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <span className="text-sm text-gray-700 font-medium truncate max-w-xs">{inputText}</span>
          </div>
          <div className="flex items-center gap-2">
            {generatedHtml && (
              <button
                onClick={handleDownloadHtml}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 11V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                下载 HTML
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              重新生成
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 flex items-center justify-center p-6 bg-gray-100" ref={previewContainerRef}>
          {generatedHtml ? (
            <div
              className="bg-white shadow-2xl rounded-lg overflow-hidden"
              style={{
                width: 1280,
                height: 720,
                transform: `scale(${previewScale})`,
                transformOrigin: 'center center',
              }}
            >
              <iframe
                srcDoc={generatedHtml}
                title="slide-preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          ) : generatedImageUrl ? (
            <img
              src={generatedImageUrl}
              alt="generated"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1048 602" fill="none" preserveAspectRatio="xMidYMid slice">
          <g opacity="0.25" filter="url(#bg_blur1)">
            <path d="M-26 202C-26 61 88-53 230-53H283C424-53 538 61 538 202C538 343 424 458 283 458H230C88 458-26 343-26 202Z" fill="#BEDBFF" fillOpacity="0.5" />
          </g>
          <g opacity="0.25" filter="url(#bg_blur2)">
            <path d="M427 559C427 428 533 322 664 322H865C996 322 1102 428 1102 559C1102 690 996 796 865 796H664C533 796 427 690 427 559Z" fill="#E9D4FF" fillOpacity="0.5" />
          </g>
          <g opacity="0.25" filter="url(#bg_blur3)">
            <path d="M470 224C470 128 547 51 643 51H810C906 51 983 128 983 224C983 319 906 397 810 397H643C547 397 470 319 470 224Z" fill="#FCE7F3" fillOpacity="0.5" />
          </g>
          <defs>
            <filter id="bg_blur1" x="-226" y="-253" width="964" height="911" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="100" result="effect1" />
            </filter>
            <filter id="bg_blur2" x="227" y="122" width="1075" height="874" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="100" result="effect1" />
            </filter>
            <filter id="bg_blur3" x="310" y="-109" width="833" height="666" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feFlood floodOpacity="0" result="BackgroundImageFix" /><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" /><feGaussianBlur stdDeviation="80" result="effect1" />
            </filter>
          </defs>
        </svg>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 px-6 py-8 overflow-y-auto">
        {/* Title */}
        <h1 className="text-2xl font-semibold text-gray-800 mb-8 select-none">
          灵感瞬间生成，细节随心修改
        </h1>

        {/* Input area */}
        <div className="w-full max-w-2xl mb-8">
          <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-200/60 overflow-hidden">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="px-5 pt-4 pb-3 min-h-[120px] max-h-[200px] overflow-y-auto text-sm text-gray-800 leading-relaxed outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
              data-placeholder="输入 PPT 主题或粘贴内容，生成专业的演示页面"
              onInput={(e) => setInputText((e.target as HTMLDivElement).textContent || '')}
              onKeyDown={handleKeyDown}
            />

            {/* Footer */}
            <div className="flex items-center justify-end px-4 pb-3 pt-1">
              <button
                onClick={handleGenerate}
                disabled={!inputText.trim() || isGenerating}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg
                  hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
                    </svg>
                    生成中...
                  </>
                ) : (
                  <>
                    立即生成
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M1 7.5H15M15 7.5L10.25 12.5M15 7.5L10.25 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Streaming indicator */}
        {isGenerating && streamContent && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-indigo-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-medium text-indigo-600">AI 正在生成...</span>
              </div>
              <pre className="text-xs text-gray-500 max-h-32 overflow-y-auto whitespace-pre-wrap wrap-break-word font-mono">
                {streamContent.slice(-500)}
              </pre>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full max-w-2xl mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">生成失败</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Mode selector */}
        <div className="w-full max-w-2xl mb-6">
          <div className="text-xs font-medium text-gray-500 mb-3">选择生成模式</div>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(MODE_CONFIG) as GenerationMode[]).map((key) => {
              const cfg = MODE_CONFIG[key];
              const isActive = mode === key;
              return (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50/80 shadow-sm'
                      : 'border-gray-200 bg-white/70 hover:border-gray-300 hover:bg-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute top-2 right-2">
                      <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center">
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={isActive ? 'text-indigo-600' : 'text-gray-500'}>{cfg.icon}</span>
                    <span className={`text-sm font-medium ${isActive ? 'text-indigo-700' : 'text-gray-700'}`}>
                      {cfg.title}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{cfg.subtitle}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Template selector (hidden for creative mode) */}
        {mode !== 'creative' && (
          <div className="w-full max-w-2xl mb-6">
            <div className="text-xs font-medium text-gray-500 mb-3">选择参考模版做同款</div>
            <div className="relative" ref={templateScrollRef}>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                {/* Smart match option */}
                <button
                  onClick={() => {
                    setIsSmartMatch(true);
                    setSelectedTemplateId(null);
                  }}
                  className={`shrink-0 w-32 h-24 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                    isSmartMatch
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 bg-white/70 hover:border-gray-300'
                  }`}
                >
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M7.5 7.15L9.49 3.02C9.49 3.01 9.51 3.01 9.51 3.02L11.5 7.15L14.98 8.99C14.99 8.99 14.99 9.01 14.98 9.01L11.5 10.85L9.51 14.98C9.51 14.99 9.49 14.99 9.49 14.98L7.5 10.85L4.02 9.01C4.01 9.01 4.01 8.99 4.02 8.99L7.5 7.15Z"
                      stroke={isSmartMatch ? '#6366f1' : '#9ca3af'}
                      strokeWidth="1"
                      fill="none"
                    />
                    <path
                      d="M2.59 2.73L3.49 1.02C3.49 1.01 3.51 1.01 3.51 1.02L4.41 2.73L5.98 3.49C5.99 3.49 5.99 3.51 5.98 3.51L4.41 4.27L3.51 5.98C3.51 5.99 3.49 5.99 3.49 5.98L2.59 4.27L1.02 3.51C1.01 3.51 1.01 3.49 1.02 3.49L2.59 2.73Z"
                      stroke={isSmartMatch ? '#6366f1' : '#9ca3af'}
                      strokeWidth="1"
                      fill="none"
                    />
                  </svg>
                  <div className="text-center">
                    <div className={`text-xs font-medium ${isSmartMatch ? 'text-indigo-600' : 'text-gray-600'}`}>
                      智能匹配
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">AI 根据内容匹配</div>
                  </div>
                </button>

                {/* Template list */}
                {templateList.map((tpl) => {
                  const isActive = !isSmartMatch && selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setIsSmartMatch(false);
                        setSelectedTemplateId(tpl.id);
                      }}
                      className={`shrink-0 w-32 h-24 rounded-xl border-2 transition-all flex flex-col items-center justify-center p-2 gap-1 ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 bg-white/70 hover:border-gray-300'
                      }`}
                      title={tpl.description}
                    >
                      <div className="text-lg opacity-50">
                        {tpl.name.startsWith('📝') || tpl.name.startsWith('📊') || tpl.name.startsWith('⏳')
                          ? tpl.name.slice(0, 2)
                          : '📄'}
                      </div>
                      <div className={`text-xs font-medium text-center truncate w-full ${isActive ? 'text-indigo-600' : 'text-gray-600'}`}>
                        {tpl.name.replace(/^[📝📊⏳]\s*/, '')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SinglePageGen;
