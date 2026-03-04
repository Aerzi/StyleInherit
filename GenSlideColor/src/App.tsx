import { useState, Component, type ReactNode } from 'react';
import StyleInheritance from './components/StyleInheritance/StyleInheritance';
import { SinglePageGen } from './components/SinglePageGen';
import { WhiteboxBatchPanel } from './components/WhiteboxBatchPanel';
import { ImageScorePanel } from './components/ImageScorePanel';
import './App.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, color: '#b91c1c', background: '#fef2f2', minHeight: '100vh', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <strong>组件报错：</strong><br />{this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [activePage, setActivePage] = useState<'inheritance' | 'single' | 'whitebox' | 'score'>('inheritance');

  return (
    <AppErrorBoundary>
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

            <button
              onClick={() => setActivePage('whitebox')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3
                ${activePage === 'whitebox' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}
              `}
            >
              <span>📦</span>
              <span className="font-medium">批量测试</span>
            </button>

            <button
              onClick={() => setActivePage('score')}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all flex items-center gap-3
                ${activePage === 'score' 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'}
              `}
            >
              <span>🖼️</span>
              <span className="font-medium">图片对比打分</span>
            </button>
          </nav>

          <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
            v1.0.0 Alpha
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 relative">
          {activePage === 'inheritance' && <StyleInheritance />}
          {activePage === 'single' && <SinglePageGen />}
          {activePage === 'whitebox' && <WhiteboxBatchPanel />}
          {activePage === 'score' && <ImageScorePanel />}
        </div>
      </div>
    </div>
    </AppErrorBoundary>
  );
}

export default App;
