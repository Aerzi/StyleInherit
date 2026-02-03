import { useState } from 'react';
import StyleInheritance from './components/StyleInheritance/StyleInheritance';
import './App.css';

function App() {
  const [activePage, setActivePage] = useState<'inheritance' | 'single'>('inheritance');

  return (
    <div className="flex flex-col h-screen w-screen bg-white">
      {/* Sidebar / Navigation */}
      <div className="flex h-full">
        <div className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-800">
            <span className="text-[24px] font-bold bg-clip-text text-transparent bg-linear-to-r from-indigo-400 to-cyan-400">
               样式继承demo
            </span>
          </div>
          
          <nav className="flex-1 p-4 flex flex-col gap-2">
            <button
              onClick={() => setActivePage('inheritance')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3
                ${activePage === 'inheritance' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}
              `}
            >
              <span>🎨</span>
              <span className="font-medium">样式继承</span>
            </button>

            <button
              onClick={() => setActivePage('single')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3
                ${activePage === 'single' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}
              `}
            >
              <span>📄</span>
              <span className="font-medium">单页生成</span>
            </button>
          </nav>

          <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
            v1.0.0 Alpha
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative">
          {activePage === 'inheritance' ? (
            <StyleInheritance />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 flex-col gap-4">
               <div className="text-6xl opacity-20">📄</div>
               <p className="text-xl font-medium">单页生成功能开发中</p>
               <p className="text-sm">Coming Soon...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
