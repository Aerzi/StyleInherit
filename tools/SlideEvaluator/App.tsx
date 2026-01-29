import React, { useState } from 'react';
import { AppTab } from './types';
import Evaluator from './components/Evaluator';
import ImageGenerator from './components/ImageGenerator';
import ChatBot from './components/ChatBot';
import { BarChart3, Image as ImageIcon, MessageSquare } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.EVALUATOR);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-lg">
                 <BarChart3 className="text-white w-5 h-5" />
              </div>
              <span className="font-bold text-xl bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
                PPT 评估器 <span className="text-xs font-normal text-gray-500 uppercase tracking-wider ml-1">专业套件</span>
              </span>
            </div>
            
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab(AppTab.EVALUATOR)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === AppTab.EVALUATOR
                    ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                评估器
              </button>
              <button
                onClick={() => setActiveTab(AppTab.IMAGE_GEN)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === AppTab.IMAGE_GEN
                    ? 'bg-white dark:bg-gray-700 text-pink-600 dark:text-pink-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                生成器
              </button>
              <button
                onClick={() => setActiveTab(AppTab.CHAT)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === AppTab.CHAT
                    ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                聊天机器人
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === AppTab.EVALUATOR && (
          <div className="animate-in fade-in duration-300">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">HTML 幻灯片评估器</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                根据美学、结构、内容和完整性，对两个 HTML 生成的幻灯片进行对比分析。
              </p>
            </div>
            <Evaluator />
          </div>
        )}
        
        {activeTab === AppTab.IMAGE_GEN && (
          <div className="animate-in fade-in duration-300">
             <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">图像资源生成器</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                使用生成式 AI 为您的演示文稿创建高分辨率视觉资源。
              </p>
            </div>
            <ImageGenerator />
          </div>
        )}

        {activeTab === AppTab.CHAT && (
          <div className="animate-in fade-in duration-300">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">助理聊天</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                探讨设计原则，获取提示词灵感，或对您的幻灯片进行故障排除。
              </p>
            </div>
            <ChatBot />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
