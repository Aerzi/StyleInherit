import React, { useState } from 'react';
import { generateImage } from '../services/geminiService';
import { ImageSize } from '../types';
import { Image as ImageIcon, Sparkles, Download, Loader2 } from 'lucide-react';

const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<ImageSize>(ImageSize.OneK);
  const [loading, setLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const result = await generateImage(prompt, size);
      setGeneratedImage(result);
    } catch (error) {
      console.error("Image generation error:", error);
      alert("生成图像失败。请确保您选择了支持 Veo/Imagen 模型的付费 API 密钥。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          专业图像生成器
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          使用 Gemini 3 Pro 为您的 PPT 幻灯片生成高质量视觉资源。
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">图像描述</label>
            <textarea
              className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-pink-500 outline-none transition-shadow"
              rows={3}
              placeholder="例如：一个展示 AI 分析的未来主义仪表盘..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-1/3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">分辨率</label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as ImageSize)}
                className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-pink-500 outline-none"
              >
                <option value={ImageSize.OneK}>1K (标准)</option>
                <option value={ImageSize.TwoK}>2K (高分辨率)</option>
                <option value={ImageSize.FourK}>4K (超清)</option>
              </select>
            </div>
            
            <div className="w-full sm:w-2/3">
               <button
                onClick={handleGenerate}
                disabled={loading || !prompt}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    正在生成...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    生成图像
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {generatedImage && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-500">
           <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-gray-800 dark:text-white">生成结果</h3>
              <a 
                href={generatedImage} 
                download={`gemini-gen-${Date.now()}.png`}
                className="text-sm flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Download className="w-4 h-4" />
                下载
              </a>
           </div>
           <div className="rounded-lg overflow-hidden bg-black/5 border border-gray-200 dark:border-gray-600">
             <img src={generatedImage} alt="Generated" className="w-full h-auto" />
           </div>
        </div>
      )}
    </div>
  );
};

export default ImageGenerator;
