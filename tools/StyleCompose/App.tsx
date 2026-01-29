
import React, { useState, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { performPPTAudit } from './geminiService';
import { AuditResult, ImagePreview } from './types';
import CareerPlanning from './CareerPlanning';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'career'>('audit');
  const [img1, setImg1] = useState<ImagePreview | null>(null);
  const [img2, setImg2] = useState<ImagePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      const preview = {
        url: reader.result as string,
        base64,
        mimeType: file.type
      };
      if (slot === 1) setImg1(preview);
      else setImg2(preview);
    };
    reader.readAsDataURL(file);
  };

  const startAudit = async () => {
    if (!img1 || !img2) return;
    setLoading(true);
    setError(null);
    try {
      const res = await performPPTAudit(img1.base64, img2.base64, img1.mimeType);
      setResult(res);
    } catch (err) {
      setError("审计过程中发生错误，请检查网络或API配置。");
    } finally {
      setLoading(false);
    }
  };

  const scoreData = result ? [
    { name: 'Match', value: result.matchScore },
    { name: 'Gap', value: 100 - result.matchScore }
  ] : [];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-10 text-center">
        <div className="flex justify-center gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('audit')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'audit' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            基因审计
          </button>
          <button 
            onClick={() => setActiveTab('career')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'career' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
          >
            职业规划预览
          </button>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight mb-2">
          {activeTab === 'audit' ? 'PPT 视觉基因对比审计工具' : '大学生职业生涯规划展示'} 
          <span className="text-sm font-normal bg-blue-100 text-blue-700 px-2 py-1 rounded ml-2">V6.2</span>
        </h1>
        <p className="text-slate-500">
          {activeTab === 'audit' ? '基于 Gemini 多模态引擎的专业一致性审计' : '基于图片原型实现的交互式动态组件'}
        </p>
      </header>

      {activeTab === 'career' ? (
        <div className="animate-in fade-in zoom-in duration-500">
          <CareerPlanning />
        </div>
      ) : (
        <>
          {/* Upload Section */}
      <div className="grid md:grid-cols-2 gap-8 mb-10">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs">1</span>
            基准图 (Benchmark)
          </h2>
          <div className="aspect-video bg-slate-100 rounded-xl mb-4 overflow-hidden border-2 border-dashed border-slate-300 flex items-center justify-center relative group">
            {img1 ? (
              <img src={img1.url} className="w-full h-full object-contain" alt="Preview 1" />
            ) : (
              <span className="text-slate-400">请选择 PPT 图片</span>
            )}
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => handleFileChange(e, 1)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs">2</span>
            待审图 (Audit Target)
          </h2>
          <div className="aspect-video bg-slate-100 rounded-xl mb-4 overflow-hidden border-2 border-dashed border-slate-300 flex items-center justify-center relative group">
            {img2 ? (
              <img src={img2.url} className="w-full h-full object-contain" alt="Preview 2" />
            ) : (
              <span className="text-slate-400">请选择 PPT 图片</span>
            )}
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => handleFileChange(e, 2)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="flex justify-center mb-12">
        <button
          onClick={startAudit}
          disabled={!img1 || !img2 || loading}
          className={`px-10 py-4 rounded-full font-bold text-white transition-all shadow-lg ${
            !img1 || !img2 || loading 
              ? 'bg-slate-300 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95'
          }`}
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              基因提取中...
            </div>
          ) : "开始基因审计"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-8 border border-red-100 text-center">
          {error}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="grid lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Match Score */}
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center">
            <h3 className="text-xl font-bold mb-6">Match Score</h3>
            <div className="w-full h-64 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={scoreData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    <Cell fill="#2563eb" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-slate-800">{result.matchScore}%</span>
                <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">一致性系数</span>
              </div>
            </div>
            <p className="text-center text-slate-500 text-sm mt-4 italic">
              基于 V6.2 协议的多维加权评估
            </p>
          </div>

          {/* Gene Table */}
          <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
            <h3 className="text-xl font-bold mb-6">基因差异对照表</h3>
            <div className="space-y-4">
              <GeneItem label="背景纯度" value={result.geneTable.backgroundColor} icon="🎨" />
              <GeneItem label="强调色系" value={result.geneTable.accentColor} icon="✨" />
              <GeneItem label="字体色/对比" value={result.geneTable.fontColor} icon="A" />
              <GeneItem label="材质/圆角/投影" value={result.geneTable.materialTexture} icon="💎" />
              <GeneItem label="布局/锚点一致性" value={result.geneTable.layout} icon="📐" />
            </div>
          </div>

          {/* Advice */}
          <div className="lg:col-span-3 bg-gradient-to-br from-slate-800 to-slate-900 text-white p-8 rounded-3xl shadow-2xl">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              导出修改建议
            </h3>
            <div className="prose prose-invert max-w-none">
              <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                {result.exportAdvice}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Protocols Footer */}
      <footer className="mt-20 border-t border-slate-200 pt-8 pb-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] text-slate-400 uppercase tracking-tighter text-center">
          <div>中心禁区审计: 60%-70% 排除</div>
          <div>边缘锚点校对: 100% 覆盖</div>
          <div>材质物理参数化: 开启</div>
          <div>色彩明度对冲: 强制检测</div>
        </div>
      </footer>
    </>
  )}
</div>
);
};

const GeneItem: React.FC<{ label: string; value: string; icon: string }> = ({ label, value, icon }) => (
  <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
    <div className="w-10 h-10 bg-white shadow-sm rounded-xl flex items-center justify-center text-lg border border-slate-100">
      {icon}
    </div>
    <div className="flex-1">
      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-slate-700 text-sm leading-relaxed">{value}</div>
    </div>
  </div>
);

export default App;
