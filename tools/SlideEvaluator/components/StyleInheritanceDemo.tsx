import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Palette, 
  Type, 
  Check, 
  X, 
  ChevronRight, 
  Layout, 
  Sparkles, 
  Settings2,
  Image as ImageIcon,
  MoreHorizontal
} from 'lucide-react';

type Scheme = 'A' | 'B' | 'C';

const StyleInheritanceDemo: React.FC = () => {
  const [activeScheme, setActiveScheme] = useState<Scheme>('A');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [chipsVisible, setChipsVisible] = useState(false); // For Scheme B simulated auto-detection
  const [isLoading, setIsLoading] = useState(false);

  // Reset state when scheme changes
  const handleSchemeChange = (scheme: Scheme) => {
    setActiveScheme(scheme);
    setIsDrawerOpen(false);
    setIsModalOpen(false);
    setChipsVisible(scheme === 'B'); // Scheme B shows chips immediately/automatically in this demo logic or after some trigger? 
    // Prompt says: "Inside the Input Bar, automatically show 2 small Capsule Tags"
  };

  const handleGenerate = () => {
    if (isLoading) return;
    setIsLoading(true);
    
    // Simulate processing delay
    setTimeout(() => {
      setIsLoading(false);
      
      switch (activeScheme) {
        case 'A':
          setIsDrawerOpen(true);
          break;
        case 'B':
          // Scheme B just generates, but maybe we show a toast or highlight the chips?
          // For demo purposes, let's assume detection happened before, 
          // but clicking generate confirms it or maybe Scheme B is "Auto" and Generate just does it.
          // Re-reading: "Scheme B: Inline Chips... Clicking a tag opens a tiny Popover... Action: Inside the Input Bar..."
          // The chips are already there *before* generate? 
          // "Action: User clicks 'Generate' -> A Right-Side Panel slides in" is for Scheme A.
          // For Scheme B, the prompt says "Action: Inside the Input Bar, automatically show 2 small Capsule Tags". 
          // This implies detection happens as you type or context is set.
          // Let's assume for this demo, clicking Generate just flashes a success message since specs were already visible.
          alert("Generating with selected styles: Blue Theme, Sans-Serif");
          break;
        case 'C':
          setIsModalOpen(true);
          break;
      }
    }, 800);
  };

  return (
    <div className="min-h-[600px] bg-slate-100 rounded-xl overflow-hidden shadow-2xl relative font-sans text-slate-800 flex flex-col">
      {/* Top Control Panel (For Demo Switching) */}
      <div className="bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
        <div className="font-bold text-slate-700 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-indigo-600" />
          Interaction Scheme Demo
        </div>
        <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
          <SchemeButton 
            active={activeScheme === 'A'} 
            onClick={() => handleSchemeChange('A')} 
            label="Scheme A: Drawer" 
          />
          <SchemeButton 
            active={activeScheme === 'B'} 
            onClick={() => handleSchemeChange('B')} 
            label="Scheme B: Chips" 
          />
          <SchemeButton 
            active={activeScheme === 'C'} 
            onClick={() => handleSchemeChange('C')} 
            label="Scheme C: Modal" 
          />
        </div>
      </div>

      {/* Main Workspace (The Stage) */}
      <div className="flex-1 relative flex items-center justify-center bg-slate-100 p-8 overflow-hidden">
        
        {/* Previous Page Thumbnail (Context Source) */}
        <div className="absolute left-8 top-1/2 -translate-y-1/2 w-48 aspect-[4/3] bg-white rounded-lg shadow-md border border-slate-200 p-2 hidden lg:block opacity-60 hover:opacity-100 transition-opacity">
           <div className="w-full h-full bg-slate-50 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center gap-2">
              <div className="w-16 h-12 bg-[#003366] rounded-sm"></div>
              <span className="text-xs text-slate-400 font-medium">Previous Page</span>
           </div>
        </div>

        {/* Current Canvas */}
        <div className="w-full max-w-3xl aspect-[16/9] bg-white shadow-xl rounded-lg flex items-center justify-center border border-slate-200 relative">
          <span className="text-slate-300 font-medium text-lg">New Page Canvas</span>
          
          {/* Floating AI Input Bar */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-3/4 max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 flex items-center gap-3 z-20">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            
            <div className="flex-1 flex flex-col justify-center min-h-[44px]">
              <input 
                type="text" 
                placeholder="Describe the new page..." 
                className="w-full bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 font-medium"
              />
              
              {/* Scheme B: Inline Chips */}
              {activeScheme === 'B' && (
                <div className="flex items-center gap-2 mt-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors">
                    <span className="w-2 h-2 rounded-full bg-[#003366]"></span>
                    Blue Theme
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
                    <Type className="w-3 h-3" />
                    Sans-Serif
                  </span>
                </div>
              )}
            </div>

            <button 
              onClick={handleGenerate}
              disabled={isLoading}
              className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></span>
              ) : (
                <>
                  Generate
                  <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center text-[10px]">⏎</div>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scheme A: Side Drawer */}
      <AnimatePresence>
        {isDrawerOpen && activeScheme === 'A' && (
          <>
            {/* Backdrop (Optional for drawer, but usually good for focus) */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="absolute inset-0 bg-black z-30"
            />
            
            {/* Drawer Panel */}
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-4 bottom-4 right-4 w-80 bg-white shadow-2xl rounded-2xl z-40 flex flex-col overflow-hidden border border-slate-100"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="font-bold text-slate-800">Style Confirmation</h3>
                <button onClick={() => setIsDrawerOpen(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 flex-1 overflow-y-auto">
                <p className="text-sm text-slate-500 mb-6 bg-blue-50 text-blue-700 p-3 rounded-lg border border-blue-100 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
                  AI detected complex style from previous page. Please confirm these settings.
                </p>

                <div className="space-y-6">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Extracted Palette</label>
                    <div className="flex items-center gap-3">
                      <ColorSwatch color="#003366" label="Primary" large />
                      <ColorSwatch color="#E6F0FF" label="Bg" />
                      <ColorSwatch color="#F59E0B" label="Accent" />
                      <button className="w-10 h-10 rounded-full border border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Typography</label>
                    <div className="p-3 border border-slate-200 rounded-xl flex items-center justify-between hover:border-blue-300 cursor-pointer transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                          <Type className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">Microsoft YaHei</div>
                          <div className="text-xs text-slate-400">Sans-Serif</div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                <button 
                  onClick={() => { setIsDrawerOpen(false); alert("Page Generated!"); }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Confirm & Generate
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Scheme C: Modal */}
      <AnimatePresence>
        {isModalOpen && activeScheme === 'C' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900" 
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Style Match Verification</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8">
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">Reference Page</div>
                    <div className="aspect-[4/3] bg-slate-100 rounded-lg border-2 border-slate-200 flex items-center justify-center">
                      <div className="w-1/3 h-1/4 bg-[#003366] rounded"></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 text-center flex items-center justify-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Extracted Style
                    </div>
                    <div className="aspect-[4/3] bg-white rounded-lg border-2 border-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.1)] p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded-full bg-[#003366]"></div>
                        <span className="text-sm font-medium text-slate-600">#003366</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                         <Type className="w-5 h-5 text-slate-400" />
                         <span className="text-sm font-medium text-slate-800">Microsoft YaHei</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                   <button 
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                  >
                    Adjust Manually
                  </button>
                  <button 
                    onClick={() => { setIsModalOpen(false); alert("Page Generated!"); }}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-colors flex items-center justify-center gap-2"
                  >
                    Accept & Continue
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-components
const SchemeButton: React.FC<{ active: boolean; onClick: () => void; label: string }> = ({ active, onClick, label }) => (
  <button 
    onClick={onClick}
    className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${
      active 
        ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200' 
        : 'text-slate-500 hover:bg-slate-200/50'
    }`}
  >
    {label}
  </button>
);

const ColorSwatch: React.FC<{ color: string; label?: string; large?: boolean }> = ({ color, label, large }) => (
  <div className="flex flex-col items-center gap-2 group cursor-pointer">
    <div 
      className={`rounded-full shadow-sm border border-black/5 transition-transform group-hover:scale-110 ${large ? 'w-14 h-14' : 'w-10 h-10'}`} 
      style={{ backgroundColor: color }}
    />
    {label && <span className="text-[10px] font-medium text-slate-400">{label}</span>}
  </div>
);

export default StyleInheritanceDemo;


