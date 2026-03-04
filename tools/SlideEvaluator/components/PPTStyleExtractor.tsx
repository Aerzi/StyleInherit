import React, { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { Upload, FileType, Loader2, CheckCircle2, AlertCircle, Palette, Type, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface StyleStats {
  colors: { [key: string]: number };
  fonts: { [key: string]: number };
  themeColors: { [key: string]: string }; // name -> hex mapping from theme1.xml
  totalSlides: number;
}

interface ExtractedStyle {
  dominantColors: { color: string; count: number; name?: string }[];
  dominantFonts: { font: string; count: number }[];
  themeScheme: { name: string; color: string }[];
}

// --- Helper: Parse XML safely ---
const parseXml = (xmlStr: string) => {
  return new DOMParser().parseFromString(xmlStr, "application/xml");
};

// --- Helper: Hex conversion ---
const decimalToHex = (d: string) => {
  let hex = Number(d).toString(16);
  while (hex.length < 6) {
    hex = "0" + hex;
  }
  return hex.toUpperCase();
};

const PPTStyleExtractor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<ExtractedStyle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processPPTX = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('初始化工程解析引擎...');

    try {
      const zip = await JSZip.loadAsync(file);
      
      // 1. Parse Theme (DNA)
      setProgress('提取主题基因 (Theme DNA)...');
      const themeFile = zip.file("ppt/theme/theme1.xml");
      const themeColors: { [key: string]: string } = {};
      
      if (themeFile) {
        const themeText = await themeFile.async("string");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(themeText, "text/xml");
        
        // Extract Color Scheme Map
        const clrScheme = xmlDoc.getElementsByTagName("a:clrScheme")[0];
        if (clrScheme) {
          // Standard PPT Theme keys: dk1, lt1, dk2, lt2, accent1-6, hlink, folHlink
          const colorKeys = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];
          
          for (const key of colorKeys) {
            const node = clrScheme.getElementsByTagName(`a:${key}`)[0];
            if (node) {
              const srgbClr = node.getElementsByTagName("a:srgbClr")[0];
              const sysClr = node.getElementsByTagName("a:sysClr")[0];
              
              if (srgbClr) {
                themeColors[key] = srgbClr.getAttribute("val") || "";
              } else if (sysClr) {
                themeColors[key] = sysClr.getAttribute("lastClr") || "FFFFFF"; // Fallback often white/black
              }
            }
          }
        }
      }

      // 2. Scan Slides (Usage)
      const slideFiles = Object.keys(zip.files).filter(path => path.startsWith("ppt/slides/slide") && path.endsWith(".xml"));
      const totalSlides = slideFiles.length;
      
      const stats: StyleStats = {
        colors: {},
        fonts: {},
        themeColors,
        totalSlides
      };

      setProgress(`扫描 ${totalSlides} 页幻灯片以提取样式模式...`);

      // Process slides in parallel for speed
      await Promise.all(slideFiles.map(async (fileName) => {
        const content = await zip.file(fileName)?.async("string");
        if (!content) return;

        // --- Fast Regex Extraction ---
        
        // 1. Color References
        // Match <a:schemeClr val="accent1"/>
        const schemeClrMatches = content.match(/<a:schemeClr\s+val="([^"]+)"/g);
        if (schemeClrMatches) {
          schemeClrMatches.forEach(match => {
            const val = match.match(/val="([^"]+)"/)?.[1];
            if (val && themeColors[val]) {
              const hex = themeColors[val];
              stats.colors[hex] = (stats.colors[hex] || 0) + 1;
            }
          });
        }

        // Match <a:srgbClr val="FF0000"/>
        const srgbClrMatches = content.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g);
        if (srgbClrMatches) {
          srgbClrMatches.forEach(match => {
            const hex = match.match(/val="([0-9A-Fa-f]{6})"/)?.[1]?.toUpperCase();
            if (hex) {
              stats.colors[hex] = (stats.colors[hex] || 0) + 1;
            }
          });
        }

        // 2. Font References
        // Match <a:latin typeface="Arial"/> or <a:ea typeface="Microsoft YaHei"/>
        const fontMatches = content.match(/typeface="([^"]+)"/g);
        if (fontMatches) {
          fontMatches.forEach(match => {
            const font = match.match(/typeface="([^"]+)"/)?.[1];
            if (font && font !== '+mj-ea' && font !== '+mn-ea' && font !== '+mj-lt' && font !== '+mn-lt') { // Ignore theme refs for now to get raw names
              stats.fonts[font] = (stats.fonts[font] || 0) + 1;
            }
          });
        }
      }));

      // 3. Aggregate Results
      setProgress('计算最大样式公因数 (GCD)...');
      
      // Sort Colors
      const dominantColors = Object.entries(stats.colors)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8)
        .map(([color, count]) => ({ color, count }));

      // Sort Fonts
      const dominantFonts = Object.entries(stats.fonts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([font, count]) => ({ font, count }));

      // Theme Scheme Array
      const themeScheme = Object.entries(themeColors).map(([name, color]) => ({ name, color }));

      setResult({
        dominantColors,
        dominantFonts,
        themeScheme
      });

    } catch (err) {
      console.error(err);
      setError("无法解析 PPTX 文件。请确保文件未损坏。");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processPPTX(file);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4">
      {/* Upload Area */}
      <div 
        className={`border-3 border-dashed rounded-3xl p-10 text-center transition-all ${
          loading ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50/30'
        }`}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
            {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-800">
              {loading ? "正在解析演示文稿 DNA..." : "上传 PPTX 以提取样式基因"}
            </h3>
            <p className="text-slate-500 max-w-md mx-auto">
              {loading 
                ? progress 
                : "基于 XML 工程化解析，提取所有幻灯片中的“最大样式公因数”。"}
            </p>
          </div>

          {!loading && (
            <label className="mt-4 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold cursor-pointer hover:bg-slate-800 transition-transform active:scale-95 shadow-xl shadow-slate-200">
              选择 PPTX 文件
              <input type="file" accept=".pptx" className="hidden" onChange={handleFileChange} />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid md:grid-cols-2 gap-8"
          >
            {/* Color System */}
            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                <Palette className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-slate-800">色彩体系 DNA (Color System)</h3>
                <span className="ml-auto text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">
                  HEX CODE
                </span>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">主要使用色彩 (按幻灯片引用计数)</label>
                  <div className="flex flex-wrap gap-3">
                    {result.dominantColors.map((c, i) => (
                      <div key={c.color} className="flex flex-col items-center gap-1 group relative">
                        <div 
                          className="w-12 h-12 rounded-xl shadow-sm border border-black/5 flex items-center justify-center text-[10px] font-bold text-white/90"
                          style={{ backgroundColor: `#${c.color}` }}
                        >
                          {i + 1}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">#{c.color}</span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                          出现 {c.count} 次
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">基础主题色 (Theme Scheme)</label>
                  <div className="grid grid-cols-5 gap-2">
                    {result.themeScheme.map((c) => (
                       <div key={c.name} className="h-2 w-full rounded-full" style={{ backgroundColor: `#${c.color}` }} title={`${c.name}: #${c.color}`} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-100 border border-slate-100">
              <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                <Type className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800">字体 DNA (Typography)</h3>
              </div>

              <div className="space-y-4">
                {result.dominantFonts.length > 0 ? (
                  result.dominantFonts.map((f, i) => (
                    <div key={f.font} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded flex items-center justify-center font-serif text-slate-400 border border-slate-200">
                          Aa
                        </div>
                        <span className="font-medium text-slate-700">{f.font}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                        {f.count} 处引用
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-400 italic">
                    未发现显式字体覆盖。使用主题默认字体。
                  </div>
                )}
              </div>
            </div>

            {/* JSON Export Preview (Engineering View) */}
             <div className="md:col-span-2 bg-slate-900 text-slate-300 p-6 rounded-2xl font-mono text-xs overflow-hidden relative group">
               <div className="flex justify-between items-center mb-4">
                 <div className="flex items-center gap-2">
                   <Code className="w-4 h-4 text-blue-400" />
                   <h3 className="font-bold text-white">工程化输出 (Engineering Output)</h3>
                 </div>
                 <button className="text-blue-400 hover:text-blue-300 uppercase text-[10px] tracking-wider border border-blue-400/30 px-2 py-1 rounded hover:bg-blue-400/10">Copy JSON</button>
               </div>
               <pre className="overflow-x-auto pb-2">
{JSON.stringify({
  palette: result.dominantColors.map(c => `#${c.color}`),
  fonts: result.dominantFonts.map(f => f.font),
  baseTheme: result.themeScheme
}, null, 2)}
               </pre>
               <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] text-slate-500">GCD Algorithm Active</span>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PPTStyleExtractor;
