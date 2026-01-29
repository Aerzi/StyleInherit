
import React from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend
} from 'recharts';

const data = [
  { subject: '专业技能 (Hard Skills)', current: 60, target: 90 },
  { subject: '工具/外语 (Tools)', current: 70, target: 85 },
  { subject: '抗压能力 (Resilience)', current: 80, target: 80 },
  { subject: '学习能力 (Learning)', current: 85, target: 95 },
  { subject: '实践经验 (Experience)', current: 40, target: 85 },
  { subject: '沟通协作 (Communication)', current: 50, target: 90 },
];

const CareerPlanning: React.FC = () => {
  return (
    <div className="bg-white p-8 rounded-lg shadow-xl max-w-6xl mx-auto my-10 font-sans text-slate-800 border border-slate-100">
      {/* Header */}
      <div className="flex items-center gap-4 mb-10 border-l-8 border-slate-800 pl-6">
        <h1 className="text-4xl font-black tracking-tight">
          大学生职业生涯规划：行动指南与能力构建
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left Column */}
        <div className="space-y-10">
          {/* SWOT Analysis */}
          <section>
            <div className="flex items-center gap-2 mb-6 text-amber-600">
              <div className="bg-amber-100 p-1.5 rounded-full">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3.005 3.005 0 013.75-2.906z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold italic">自我认知: SWOT 分析法</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50/50 p-4 rounded-xl border-l-4 border-emerald-500">
                <h3 className="font-bold text-emerald-700 mb-2">Strengths (优势)</h3>
                <ul className="text-xs space-y-1 text-slate-600 list-disc list-inside">
                  <li>专业基础扎实, GPA前10%</li>
                  <li>具备英语六级与计算机二级证书</li>
                  <li>逻辑思维强, 善于数据分析</li>
                </ul>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-slate-300">
                <h3 className="font-bold text-slate-700 mb-2">Weaknesses (劣势)</h3>
                <ul className="text-xs space-y-1 text-slate-600 list-disc list-inside">
                  <li>缺乏实际项目与实习经验</li>
                  <li>公开演讲能力较弱</li>
                  <li>行业人脉资源匮乏</li>
                </ul>
              </div>
              <div className="bg-amber-50/50 p-4 rounded-xl border-l-4 border-amber-500">
                <h3 className="font-bold text-amber-700 mb-2">Opportunities (机会)</h3>
                <ul className="text-xs space-y-1 text-slate-600 list-disc list-inside">
                  <li>新兴产业数字化转型需求大</li>
                  <li>校企合作项目增多</li>
                  <li>线上学习资源丰富</li>
                </ul>
              </div>
              <div className="bg-indigo-50/50 p-4 rounded-xl border-l-4 border-indigo-500">
                <h3 className="font-bold text-indigo-700 mb-2">Threats (挑战)</h3>
                <ul className="text-xs space-y-1 text-slate-600 list-disc list-inside">
                  <li>应届生就业竞争加剧</li>
                  <li>技术迭代快, 技能易过时</li>
                  <li>考研与就业的选择压力</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Path Design */}
          <section>
            <div className="flex items-center gap-2 mb-6 text-orange-600">
              <div className="bg-orange-100 p-1.5 rounded-full">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5V2a1 1 0 112 0v5a1 1 0 01-1 1h-6z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M3 18a1 1 0 01-1-1v-1a1 1 0 011-1h5v-5H3a1 1 0 01-1-1V8a1 1 0 011-1h5V2a1 1 0 112 0v5h5a1 1 0 011 1v1a1 1 0 01-1 1h-5v5h5a1 1 0 011 1v1a1 1 0 01-1 1h-5v5a1 1 0 11-2 0v-5H3z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold italic">路径设计: 大学四年行动轴</h2>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[
                { year: '大一: 探索期', desc: '了解自我与职业兴趣, 加入社团, 试错体验', icon: '🌐' },
                { year: '大二: 定向期', desc: '确立主攻方向, 考取关键证书, 辅修技能', icon: '📖' },
                { year: '大三: 冲刺期', desc: '参与高含金量实习, 参加学科竞赛, 积累作品', icon: '💼' },
                { year: '大四: 决胜期', desc: '秋招/考研/留学, 完成毕业设计, 职场过渡', icon: '🏁' }
              ].map((item, i) => (
                <div key={i} className="text-center group">
                  <div className="w-12 h-12 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-xl mx-auto mb-3 shadow-sm group-hover:border-blue-500 transition-colors">
                    {item.icon}
                  </div>
                  <h4 className="text-xs font-bold mb-1">{item.year}</h4>
                  <p className="text-[10px] text-slate-400 leading-tight">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="h-1 bg-emerald-500 rounded-full mt-4 mx-6 opacity-30"></div>
          </section>
        </div>

        {/* Right Column */}
        <div className="bg-slate-50/50 rounded-3xl p-8 border border-slate-100 flex flex-col">
          <div className="flex items-center gap-2 mb-8 text-blue-600">
            <div className="bg-blue-100 p-1.5 rounded-full">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            </div>
            <h2 className="text-xl font-bold italic">职场核心竞争力与动态调整</h2>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6">
            {['Plan 计划', 'Do 执行', 'Check 检查', 'Act 改进'].map((tab, i) => (
              <button 
                key={i} 
                className={`flex-1 py-2 px-4 rounded-md text-xs font-bold text-white transition-all shadow-sm ${
                  i === 0 ? 'bg-slate-700' : 
                  i === 1 ? 'bg-orange-500' : 
                  i === 2 ? 'bg-emerald-500' : 'bg-red-700'
                } hover:opacity-90`}
              >
                {tab.split(' ')[0]} {tab.split(' ')[1]}
              </button>
            ))}
          </div>

          <h3 className="text-center font-bold text-slate-600 mb-4">人岗匹配模型: 现状 vs 目标</h3>

          {/* Radar Chart */}
          <div className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10 }} />
                <Radar
                  name="当前能力现状"
                  dataKey="current"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.5}
                />
                <Radar
                  name="目标岗位要求"
                  dataKey="target"
                  stroke="#94a3b8"
                  fill="transparent"
                  strokeDasharray="4 4"
                />
                <Legend iconType="rect" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px', paddingTop: '20px' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 pt-8 border-t border-slate-100">
        <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
          <h3 className="text-amber-700 font-bold mb-2 flex items-center gap-1">
            <span className="text-lg">⭐</span> SMART 目标原则
          </h3>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            S-具体(Specific) | M-可衡量(Measurable) | A-可达成(Attainable) | R-相关性(Relevant) | T-有时限(Time-bound)
          </p>
        </div>
        <div className="bg-amber-50/30 p-4 rounded-xl border border-amber-100">
          <h3 className="text-amber-700 font-bold mb-2 flex items-center gap-1">
            <span className="text-lg">💡</span> 导师建议
          </h3>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            职业规划不是静态文书，而是动态过程。每学期未进行一次复盘，根据环境变化与能力增长调整下一阶段目标。
          </p>
        </div>
      </div>
    </div>
  );
};

export default CareerPlanning;

