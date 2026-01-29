import React, { useState, useRef } from 'react';
import { generateEvaluationReport } from '../services/geminiService';
import { EvaluationConfig, EvaluationReport } from '../types';
import { Upload, FileText, Play, Loader2, Trophy, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

const SYSTEM_PROMPT_TEMPLATE = `
**角色：**
你是一位资深 UI/UX 设计师和演示文稿专家。你的任务是评估并对比两个不同 AI 模型基于 HTML 技术生成的单页 PPT 幻灯片。

**输入数据：**
1.  **用户提示词：** {{USER_PROMPT}}
2.  **模型 A 图像：** [附件图片 1]
3.  **模型 B 图像：** [附件图片 2]

**评估维度（0-100 分）：**
1.  **visual (视觉美感 30%)：** 色彩、排版、留白。
2.  **structure (组件结构 25%)：** 布局、容器、信息层级。
3.  **content (内容相关性 25%)：** 遵循提示词、逻辑性。
4.  **integrity (渲染完整性 20%)：** 无错位、无乱码。

**输出格式（JSON）：**
请严格按照以下 JSON 格式输出评估结果，不要包含 markdown 代码块标记，只输出纯 JSON 字符串：

{
  "winner": "Model A" | "Model B" | "Tie",
  "modelA": {
    "scores": {
      "visual": number,
      "structure": number,
      "content": number,
      "integrity": number,
      "total": number // 加权总分
    },
    "critique": "简短中文评价，指出优缺点"
  },
  "modelB": {
    "scores": {
      // 同上
    },
    "critique": "简短中文评价，指出优缺点"
  },
  "summary": "整体对比总结，解释为何胜出"
}
`;

const Evaluator: React.FC = () => {
  const [config, setConfig] = useState<EvaluationConfig>({
    userPrompt: '',
    modelA: { image: null },
    modelB: { image: null },
  });
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<EvaluationReport | null>(null);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1280;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to JPEG with 0.8 quality to reduce size
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
    });
  };

  const handlePaste = async (model: 'modelA' | 'modelB', e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = async () => {
            const compressed = await compressImage(reader.result as string);
            setConfig(prev => ({
              ...prev,
              [model]: { ...prev[model], image: compressed }
            }));
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleImageUpload = (model: 'modelA' | 'modelB', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await compressImage(reader.result as string);
        setConfig(prev => ({
          ...prev,
          [model]: { ...prev[model], image: compressed }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEvaluate = async () => {
    if (!config.modelA.image || !config.modelB.image || !config.userPrompt) {
      alert("请填写所有字段并上传两张图片。");
      return;
    }

    setLoading(true);
    setReport(null);

    try {
      const prompt = SYSTEM_PROMPT_TEMPLATE
        .replace('{{USER_PROMPT}}', config.userPrompt);

      const response = await generateEvaluationReport(
        prompt,
        config.modelA.image,
        config.modelB.image
      );

      // Parse JSON response
      let jsonStr = response;
      // Remove markdown code blocks if present
      jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      const parsedReport: EvaluationReport = JSON.parse(jsonStr);
      setReport(parsedReport);

    } catch (error) {
      console.error("Evaluation failed", error);
      alert("评估失败。请重试。");
    } finally {
      setLoading(false);
    }
  };

  const ScoreBar = ({ score, label }: { score: number, label: string }) => (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600 dark:text-gray-400 font-medium">{label}</span>
        <span className="font-bold text-gray-800 dark:text-gray-200">{score}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-500" 
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
          <FileText className="w-5 h-5" />
          评估设置
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">原始用户提示词</label>
            <textarea
              className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
              rows={3}
              placeholder="例如：生成一张关于 2024 年 AI 趋势的幻灯片..."
              value={config.userPrompt}
              onChange={(e) => setConfig({ ...config, userPrompt: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Model A Input */}
            <div 
              onPaste={(e) => handlePaste('modelA', e)}
              className="p-4 border border-blue-100 dark:border-blue-900 rounded-lg bg-blue-50/50 dark:bg-blue-900/20"
            >
              <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-3">模型 A</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">幻灯片截图 (可粘贴)</label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 px-4 rounded-md text-sm flex items-center gap-2 transition-colors">
                      <Upload className="w-4 h-4" />
                      上传图片
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('modelA', e)} />
                    </label>
                    {config.modelA.image && <span className="text-xs text-green-600 font-medium">图片已加载</span>}
                  </div>
                  {config.modelA.image && (
                    <img src={config.modelA.image} alt="Model A" className="mt-2 h-24 object-contain rounded border border-gray-200 dark:border-gray-700 bg-black/5" />
                  )}
                </div>
              </div>
            </div>

            {/* Model B Input */}
            <div 
              onPaste={(e) => handlePaste('modelB', e)}
              className="p-4 border border-purple-100 dark:border-purple-900 rounded-lg bg-purple-50/50 dark:bg-purple-900/20"
            >
              <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-3">模型 B</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">幻灯片截图 (可粘贴)</label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 py-2 px-4 rounded-md text-sm flex items-center gap-2 transition-colors">
                      <Upload className="w-4 h-4" />
                      上传图片
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('modelB', e)} />
                    </label>
                    {config.modelB.image && <span className="text-xs text-green-600 font-medium">图片已加载</span>}
                  </div>
                  {config.modelB.image && (
                    <img src={config.modelB.image} alt="Model B" className="mt-2 h-24 object-contain rounded border border-gray-200 dark:border-gray-700 bg-black/5" />
                  )}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleEvaluate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                正在分析并生成报告...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                运行 AI 评估
              </>
            )}
          </button>
        </div>
      </div>

      {report && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex-grow flex flex-col animate-in fade-in duration-500">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              评估报告
            </h3>
            {report.winner !== 'Tie' && (
              <span className="bg-yellow-100 text-yellow-800 text-xs font-bold px-3 py-1 rounded-full border border-yellow-200">
                获胜者: {report.winner === 'Model A' ? '模型 A' : '模型 B'}
              </span>
            )}
          </div>
          
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Model A Results */}
            <div className={`p-4 rounded-xl border ${report.winner === 'Model A' ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'}`}>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-blue-800 dark:text-blue-300 text-lg">模型 A</h4>
                <div className="text-2xl font-black text-gray-900 dark:text-white">{report.modelA.scores.total} <span className="text-sm font-normal text-gray-500">分</span></div>
              </div>
              
              <div className="space-y-1 mb-4">
                <ScoreBar label="视觉美感" score={report.modelA.scores.visual} />
                <ScoreBar label="组件结构" score={report.modelA.scores.structure} />
                <ScoreBar label="内容相关性" score={report.modelA.scores.content} />
                <ScoreBar label="渲染完整性" score={report.modelA.scores.integrity} />
              </div>

              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 italic">
                "{report.modelA.critique}"
              </div>
            </div>

            {/* Model B Results */}
            <div className={`p-4 rounded-xl border ${report.winner === 'Model B' ? 'border-purple-500 bg-purple-50/30 dark:bg-purple-900/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50'}`}>
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-purple-800 dark:text-purple-300 text-lg">模型 B</h4>
                <div className="text-2xl font-black text-gray-900 dark:text-white">{report.modelB.scores.total} <span className="text-sm font-normal text-gray-500">分</span></div>
              </div>

              <div className="space-y-1 mb-4">
                <ScoreBar label="视觉美感" score={report.modelB.scores.visual} />
                <ScoreBar label="组件结构" score={report.modelB.scores.structure} />
                <ScoreBar label="内容相关性" score={report.modelB.scores.content} />
                <ScoreBar label="渲染完整性" score={report.modelB.scores.integrity} />
              </div>

              <div className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 italic">
                "{report.modelB.critique}"
              </div>
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
              <h4 className="font-bold text-gray-800 dark:text-white mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                总结分析
              </h4>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                {report.summary}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Evaluator;
