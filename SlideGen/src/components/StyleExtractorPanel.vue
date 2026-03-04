<script setup lang="ts">
import { ref } from "vue";
import JSZip from "jszip";

// --- Types ---
interface ExtractedStyle {
  dominantColors: { color: string; count: number }[];
  dominantFonts: { font: string; count: number }[];
  themeScheme: { name: string; color: string }[];
}

// --- State ---
const loading = ref(false);
const progress = ref("");
const result = ref<ExtractedStyle | null>(null);
const error = ref<string | null>(null);

// --- Logic ---
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    await processPPTX(input.files[0]);
    // Reset input so same file can be selected again if needed
    input.value = "";
  }
}

async function processPPTX(file: File) {
  loading.value = true;
  error.value = null;
  result.value = null;
  progress.value = "初始化工程解析引擎...";

  try {
    const zip = await JSZip.loadAsync(file);

    // 1. Parse Theme (DNA)
    progress.value = "提取主题基因 (Theme DNA)...";
    const themeFile = zip.file("ppt/theme/theme1.xml");
    const themeColors: Record<string, string> = {};

    if (themeFile) {
      const themeText = await themeFile.async("string");
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(themeText, "text/xml");

      const clrScheme = xmlDoc.getElementsByTagName("a:clrScheme")[0];
      if (clrScheme) {
        const colorKeys = [
          "dk1", "lt1", "dk2", "lt2",
          "accent1", "accent2", "accent3", "accent4", "accent5", "accent6",
          "hlink", "folHlink"
        ];

        for (const key of colorKeys) {
          const node = clrScheme.getElementsByTagName(`a:${key}`)[0];
          if (node) {
            const srgbClr = node.getElementsByTagName("a:srgbClr")[0];
            const sysClr = node.getElementsByTagName("a:sysClr")[0];

            if (srgbClr) {
              themeColors[key] = srgbClr.getAttribute("val") || "";
            } else if (sysClr) {
              themeColors[key] = sysClr.getAttribute("lastClr") || "FFFFFF";
            }
          }
        }
      }
    }

    // 2. Scan Slides (Usage)
    const slideFiles = Object.keys(zip.files).filter(
      (path) => path.startsWith("ppt/slides/slide") && path.endsWith(".xml")
    );
    const totalSlides = slideFiles.length;
    progress.value = `扫描 ${totalSlides} 页幻灯片以提取样式模式...`;

    const stats = {
      colors: {} as Record<string, number>,
      fonts: {} as Record<string, number>,
    };

    // Parallel processing
    await Promise.all(
      slideFiles.map(async (fileName) => {
        const content = await zip.file(fileName)?.async("string");
        if (!content) return;

        // --- Fast Regex Extraction ---

        // 1. Color References
        // Match <a:schemeClr val="accent1"/>
        const schemeClrMatches = content.match(/<a:schemeClr\s+val="([^"]+)"/g);
        if (schemeClrMatches) {
          schemeClrMatches.forEach((match) => {
            const val = match.match(/val="([^"]+)"/)?.[1];
            if (val && themeColors[val]) {
              const hex = themeColors[val];
              stats.colors[hex] = (stats.colors[hex] || 0) + 1;
            }
          });
        }

        // Match <a:srgbClr val="FF0000"/>
        const srgbClrMatches = content.match(
          /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g
        );
        if (srgbClrMatches) {
          srgbClrMatches.forEach((match) => {
            const hex = match
              .match(/val="([0-9A-Fa-f]{6})"/)?.[1]
              ?.toUpperCase();
            if (hex) {
              stats.colors[hex] = (stats.colors[hex] || 0) + 1;
            }
          });
        }

        // 2. Font References
        // Match typeface="Arial"
        const fontMatches = content.match(/typeface="([^"]+)"/g);
        if (fontMatches) {
          fontMatches.forEach((match) => {
            const font = match.match(/typeface="([^"]+)"/)?.[1];
            // Filter out internal theme refs usually starting with +
            if (font && !font.startsWith("+")) {
              stats.fonts[font] = (stats.fonts[font] || 0) + 1;
            }
          });
        }
      })
    );

    // 3. Aggregate Results (GCD / Most Frequent)
    progress.value = "计算最大样式公因数 (GCD)...";

    // Sort Colors
    const dominantColors = Object.entries(stats.colors)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([color, count]) => ({ color, count }));

    // Sort Fonts
    const dominantFonts = Object.entries(stats.fonts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([font, count]) => ({ font, count }));

    // Theme Scheme Array
    const themeScheme = Object.entries(themeColors).map(([name, color]) => ({
      name,
      color,
    }));

    result.value = {
      dominantColors,
      dominantFonts,
      themeScheme,
    };
  } catch (err) {
    console.error(err);
    error.value = "无法解析 PPTX 文件。请确保文件未损坏或格式正确。";
  } finally {
    loading.value = false;
  }
}

function copyJson() {
  if (!result.value) return;
  const json = JSON.stringify(
    {
      palette: result.value.dominantColors.map((c) => `#${c.color}`),
      fonts: result.value.dominantFonts.map((f) => f.font),
      baseTheme: result.value.themeScheme,
    },
    null,
    2
  );
  navigator.clipboard.writeText(json);
  alert("JSON 已复制到剪贴板");
}
</script>

<template>
  <div class="style-extractor-panel">
    <div class="content-wrapper">
      <!-- Upload Area -->
      <div
        class="upload-area"
        :class="{ loading: loading }"
      >
        <div class="upload-content">
          <div class="icon-wrapper">
            <span v-if="loading" class="loader">⏳</span>
            <span v-else class="icon">📤</span>
          </div>

          <div class="text-content">
            <h3>{{ loading ? "正在解析演示文稿 DNA..." : "上传 PPTX 以提取样式基因" }}</h3>
            <p>
              {{ loading ? progress : "基于 XML 工程化解析，提取所有幻灯片中的“最大样式公因数”。" }}
            </p>
          </div>

          <label v-if="!loading" class="upload-btn">
            选择 PPTX 文件
            <input
              type="file"
              accept=".pptx"
              class="hidden-input"
              @change="handleFileChange"
            />
          </label>
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="error-message">
        ⚠️ {{ error }}
      </div>

      <!-- Results -->
      <div v-if="result" class="results-grid">
        <!-- Color System -->
        <div class="result-card">
          <div class="card-header">
            <span class="header-icon">🎨</span>
            <h3>色彩体系 DNA (Color System)</h3>
            <span class="badge">HEX CODE</span>
          </div>

          <div class="card-body">
            <!-- Dominant Colors -->
            <div class="section">
              <label>主要使用色彩 (按幻灯片引用计数)</label>
              <div class="color-grid">
                <div
                  v-for="(c, i) in result.dominantColors"
                  :key="c.color"
                  class="color-item"
                >
                  <div
                    class="color-swatch"
                    :style="{ backgroundColor: `#${c.color}` }"
                    :title="`出现 ${c.count} 次`"
                  >
                    {{ i + 1 }}
                  </div>
                  <span class="color-hex">#{{ c.color }}</span>
                </div>
              </div>
            </div>

            <!-- Theme Scheme -->
            <div class="section">
              <label>基础主题色 (Theme Scheme)</label>
              <div class="theme-grid">
                <div
                  v-for="c in result.themeScheme"
                  :key="c.name"
                  class="theme-swatch"
                  :style="{ backgroundColor: `#${c.color}` }"
                  :title="`${c.name}: #${c.color}`"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Typography -->
        <div class="result-card">
          <div class="card-header">
            <span class="header-icon">🅰️</span>
            <h3>字体 DNA (Typography)</h3>
          </div>

          <div class="card-body">
            <div v-if="result.dominantFonts.length > 0" class="font-list">
              <div
                v-for="f in result.dominantFonts"
                :key="f.font"
                class="font-item"
              >
                <div class="font-info">
                  <div class="font-icon">Aa</div>
                  <span class="font-name">{{ f.font }}</span>
                </div>
                <div class="font-count">{{ f.count }} 处引用</div>
              </div>
            </div>
            <div v-else class="empty-state">
              未发现显式字体覆盖。使用主题默认字体。
            </div>
          </div>
        </div>

        <!-- JSON Output -->
        <div class="json-card">
          <div class="card-header dark">
            <div class="header-left">
              <span class="header-icon">💻</span>
              <h3>工程化输出 (Engineering Output)</h3>
            </div>
            <button class="copy-btn" @click="copyJson">Copy JSON</button>
          </div>
          <pre class="json-content">{{
            JSON.stringify(
              {
                palette: result.dominantColors.map((c) => `#${c.color}`),
                fonts: result.dominantFonts.map((f) => f.font),
                baseTheme: result.themeScheme,
              },
              null,
              2
            )
          }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.style-extractor-panel {
  padding: 32px;
  height: 100%;
  overflow-y: auto;
  background-color: var(--main-bg);
}

.content-wrapper {
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* Upload Area */
.upload-area {
  border: 3px dashed var(--border-color);
  border-radius: 24px;
  padding: 40px;
  text-align: center;
  background-color: var(--panel-bg);
  transition: all 0.3s ease;
}

.upload-area:hover {
  border-color: var(--accent-color);
  background-color: rgba(184, 115, 51, 0.05);
}

.upload-area.loading {
  background-color: var(--input-bg);
  border-color: var(--border-color);
  cursor: wait;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.icon-wrapper {
  width: 64px;
  height: 64px;
  background-color: rgba(184, 115, 51, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.icon, .loader {
  font-size: 32px;
}

.text-content h3 {
  font-size: 20px;
  font-weight: bold;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.text-content p {
  color: var(--text-secondary);
  max-width: 400px;
}

.upload-btn {
  margin-top: 16px;
  padding: 12px 32px;
  background: var(--text-primary);
  color: #fff;
  border-radius: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.1s;
  box-shadow: var(--shadow-md);
}

.upload-btn:hover {
  transform: scale(1.05);
  background: #000;
}

.upload-btn:active {
  transform: scale(0.95);
}

.hidden-input {
  display: none;
}

/* Error Message */
.error-message {
  background-color: #fef2f2;
  color: #dc2626;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #fee2e2;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Results Grid */
.results-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

@media (max-width: 768px) {
  .results-grid {
    grid-template-columns: 1fr;
  }
}

.result-card {
  background: var(--panel-bg);
  padding: 24px;
  border-radius: 16px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.header-icon {
  font-size: 20px;
}

.card-header h3 {
  font-weight: bold;
  color: var(--text-primary);
  font-size: 16px;
}

.badge {
  margin-left: auto;
  font-size: 10px;
  font-family: monospace;
  background: var(--input-bg);
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
}

/* Color Grid */
.section {
  margin-bottom: 24px;
}

.section label {
  display: block;
  font-size: 12px;
  font-weight: bold;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin-bottom: 12px;
  letter-spacing: 0.5px;
}

.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.color-swatch {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
  color: rgba(255,255,255,0.9);
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
}

.color-hex {
  font-size: 10px;
  font-family: monospace;
  color: var(--text-tertiary);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.theme-swatch {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

/* Font List */
.font-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.font-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.font-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.font-icon {
  width: 32px;
  height: 32px;
  background: var(--panel-bg);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-family: serif;
  border: 1px solid var(--border-color);
}

.font-name {
  font-weight: 500;
  color: var(--text-primary);
}

.font-count {
  font-size: 12px;
  font-weight: bold;
  color: var(--text-tertiary);
  background: var(--panel-bg);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-tertiary);
  font-style: italic;
}

/* JSON Card */
.json-card {
  grid-column: span 2;
  background: #1a1a1a;
  color: #e5e5e5;
  padding: 24px;
  border-radius: 16px;
  font-family: monospace;
  font-size: 12px;
  overflow: hidden;
}

.card-header.dark {
  border-bottom: 1px solid #333;
  margin-bottom: 16px;
  padding-bottom: 12px;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-left h3 {
  color: #fff;
}

.copy-btn {
  background: transparent;
  border: 1px solid #4ade80;
  color: #4ade80;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: rgba(74, 222, 128, 0.1);
}

.json-content {
  overflow-x: auto;
  white-space: pre-wrap;
  color: #a3a3a3;
}
</style>
