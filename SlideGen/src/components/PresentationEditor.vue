<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import AIGenerateModal from './AIGeneration/AIGenerateModal.vue';
import JSZip from 'jszip';

interface Slide {
  id: string;
  thumbnailUrl: string; // Base64 or URL
  type: 'image' | 'pptx';
  content?: string; // OOXML content or extra data
  timestamp: number;
}

// State
const slides = ref<Slide[]>([]);
const activeSlide = ref<Slide | null>(null);
const zoomLevel = ref(100);

// AI Modal State
const showAiModal = ref(false);
const previewHtml = ref('');
const showPreviewModal = ref(false);

// Storage Keys
const STORAGE_KEY = 'presentation_editor_slides';

// Load from LocalStorage
function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      slides.value = JSON.parse(data);
      if (slides.value.length > 0) {
        activeSlide.value = slides.value[0];
      }
    }
  } catch (e) {
    console.error('Failed to load slides from storage:', e);
  }
}

// Save to LocalStorage
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slides.value));
  } catch (e) {
    console.error('Failed to save slides to storage (quota exceeded?):', e);
    alert('存储空间不足，无法保存更多内容');
  }
}

// Watch changes to save
watch(slides, () => {
  saveToStorage();
}, { deep: true });

// Helper to extract text from PPTX slide XML
async function extractSlideText(xmlContent: string): Promise<string> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
  const textNodes = xmlDoc.getElementsByTagName("a:t");
  let text = "";
  for (let i = 0; i < textNodes.length; i++) {
    text += textNodes[i].textContent + "\n";
  }
  return text;
}

// Helper to extract content from PPTX
async function parsePptx(file: File): Promise<{ thumbnail: string | null; slidesData: any[] }> {
  const result = { thumbnail: null as string | null, slidesData: [] as any[] };
  
  try {
    const zip = await JSZip.loadAsync(file);
    
    // 1. Try to find the thumbnail
    const thumbFile = zip.file('docProps/thumbnail.jpeg');
    if (thumbFile) {
      const blob = await thumbFile.async('blob');
      result.thumbnail = URL.createObjectURL(blob);
    }

    // 2. Parse slides to get text content
    // Find all slide XML files
    const slideFiles = Object.keys(zip.files).filter(name => 
      name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    );
    
    // Sort by number (slide1.xml, slide2.xml, ...)
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
      const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
      return numA - numB;
    });

    for (const fileName of slideFiles) {
        const fileData = await zip.file(fileName)?.async('string');
        if (fileData) {
            const text = await extractSlideText(fileData);
            result.slidesData.push({
                fileName,
                text: text.trim()
            });
        }
    }

  } catch (e) {
    console.error('Failed to parse PPTX:', e);
  }
  return result;
}

async function processFile(file: File) {
    if (file.name.endsWith('.pptx')) {
        const { thumbnail, slidesData } = await parsePptx(file);
        
        // If we found slides, add them. If it's a single file view, maybe we just add the file as one item?
        // The user wants to "open" it.
        // Current design treats "slides" list as pages. 
        // If we extracted multiple slides from the PPTX, we should probably add them all?
        // But the user might expect the "file" to be the unit if they are pasting files.
        // However, "Opening" a PPTX usually means seeing its slides.
        
        if (slidesData.length > 0) {
            // Add each slide found in the PPTX
            slidesData.forEach((slideData, index) => {
                addSlide({
                    id: Date.now().toString() + index,
                    thumbnailUrl: index === 0 && thumbnail ? thumbnail : '', // Only first slide gets the file thumbnail for now, unless we can render
                    type: 'pptx',
                    content: slideData.text || (index === 0 ? file.name : `幻灯片 ${index + 1}`),
                    timestamp: Date.now()
                });
            });
        } else {
             // Fallback if no slides found or parsing failed
            addSlide({
                id: Date.now().toString(),
                thumbnailUrl: thumbnail || '', 
                type: 'pptx',
                content: file.name,
                timestamp: Date.now()
            });
        }

    } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            addSlide({
                id: Date.now().toString(),
                thumbnailUrl: base64,
                type: 'image',
                timestamp: Date.now()
            });
        };
        reader.readAsDataURL(file);
    }
}

// Handle Paste Event
async function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items;
  if (!items) return;

  // Check if we have a pptx file
  for (const item of items) {
      if (item.kind === 'file' && (item.type.includes('presentation') || item.getAsFile()?.name.endsWith('.pptx'))) {
          const file = item.getAsFile();
          if (file) {
             await processFile(file);
             event.preventDefault();
             return;
          }
      }
  }
  
  // Fallback to Image
  for (const item of items) {
     if (item.type.indexOf('image') !== -1) {
         const file = item.getAsFile();
         if (file) {
             await processFile(file);
             event.preventDefault();
             return;
         }
     }
  }
}

// Add Slide
function addSlide(slide: Slide) {
  slides.value.push(slide);
  activeSlide.value = slide;
}

// Delete Slide
function deleteSlide(index: number) {
  slides.value.splice(index, 1);
  if (slides.value.length === 0) {
    activeSlide.value = null;
  } else if (activeSlide.value && !slides.value.find(s => s.id === activeSlide.value!.id)) {
    activeSlide.value = slides.value[Math.max(0, index - 1)];
  }
}

// Lifecycle
onMounted(() => {
  loadFromStorage();
  window.addEventListener('paste', handlePaste);
});

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste);
});

const toolbarTabs = [
  '开始', '插入', '审阅', '视图', '播放', '效率', 'WPS AI'
];
const activeTab = ref('开始');

const fileInput = ref<HTMLInputElement | null>(null);

const tools = [
  { icon: 'fa-regular fa-folder-open', name: '打开', action: () => fileInput.value?.click() },
  { icon: 'fa-regular fa-clipboard', name: '粘贴' },
  { icon: 'fa-solid fa-scissors', name: '剪切' },
  { icon: 'fa-regular fa-copy', name: '复制' },
  { separator: true },
  { icon: 'fa-solid fa-plus', name: '新建幻灯片' },
  { icon: 'fa-solid fa-table-cells-large', name: '版式' },
  { separator: true },
  { icon: 'fa-solid fa-font', name: '字体' },
  { icon: 'fa-solid fa-align-left', name: '段落' },
  { icon: 'fa-solid fa-shapes', name: '形状' },
  { icon: 'fa-regular fa-image', name: '图片' },
];

const rightSidebarTools = [
  { icon: 'fa-solid fa-paintbrush', name: '格式' },
  { icon: 'fa-regular fa-file-powerpoint', name: '模板' },
  { icon: 'fa-solid fa-palette', name: '颜色' },
  { icon: 'fa-solid fa-font', name: '字体' },
  { icon: 'fa-solid fa-wand-magic-sparkles', name: '动画' },
  { icon: 'fa-regular fa-comment', name: '评论' },
];

function handleAiGenerate(prompt: string) {
  // Simulate generation delay
  setTimeout(() => {
    showAiModal.value = false;
    alert(`AI 生成完成！\nPrompt: ${prompt}`);
  }, 1500);
}

function handleAiResult(result: any) {
  console.log('AI Generation Result:', result);
  if (result.success) {
    if (result.html) {
      previewHtml.value = result.html;
      showPreviewModal.value = true;
    } else if (result.imageUrl) {
        // Add generated image as a new slide
        addSlide({
            id: Date.now().toString(),
            thumbnailUrl: result.imageUrl,
            type: 'image',
            timestamp: Date.now()
        });
    }
  } else {
    alert(`AI 生成失败: ${result.error}`);
  }
}

function closePreview() {
  showPreviewModal.value = false;
  previewHtml.value = '';
}
</script>

<template>
  <div class="presentation-editor">
    <!-- Top Ribbon/Toolbar -->
    <header class="header">
      <div class="tabs">
        <div 
          v-for="tab in toolbarTabs" 
          :key="tab"
          class="tab"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          {{ tab }}
        </div>
      </div>
      <div class="toolbar">
        <!-- Default Tools -->
        <template v-if="activeTab !== 'WPS AI'">
          <div v-for="(tool, index) in tools" :key="index" class="tool-item">
            <div v-if="tool.separator" class="separator"></div>
            <button v-else class="tool-btn" :title="tool.name" @click="tool.action && tool.action()">
              <span class="icon"><i :class="tool.icon"></i></span>
              <!-- <span class="label">{{ tool.name }}</span> -->
            </button>
          </div>
        </template>
        
        <!-- WPS AI Tools -->
        <template v-else>
          <div class="tool-item">
            <button class="tool-btn ai-btn" @click="showAiModal = true">
              <span class="icon"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
              <span class="label">AI 生成单页</span>
            </button>
          </div>
        </template>
      </div>
      <input type="file" ref="fileInput" style="display: none" accept=".pptx,image/*" @change="handleFileInput" />
    </header>

    <div class="main-container">
      <!-- Left Sidebar: Slides -->
      <aside class="sidebar-left">
        <div v-if="slides.length === 0" class="empty-sidebar">
            <p>暂无幻灯片</p>
            <p class="sub-text">Ctrl+V 粘贴图片</p>
        </div>
        <div 
          v-for="(slide, index) in slides" 
          :key="slide.id"
          class="slide-thumbnail"
          :class="{ active: activeSlide?.id === slide.id }"
          @click="activeSlide = slide"
        >
          <div class="slide-number">{{ index + 1 }}</div>
          <div class="thumbnail-preview">
            <img v-if="slide.type === 'image' || slide.thumbnailUrl" :src="slide.thumbnailUrl" class="preview-img" loading="lazy" />
            <div v-else class="preview-file-icon">
                <i class="fa-regular fa-file-powerpoint"></i>
            </div>
            <button class="delete-btn" @click.stop="deleteSlide(index)" title="删除">×</button>
          </div>
        </div>
      </aside>

      <!-- Center: Canvas -->
      <main class="canvas-area">
        <div class="canvas-wrapper">
          <div class="slide-canvas" :style="{ transform: `scale(${zoomLevel / 100})` }">
            <template v-if="activeSlide">
                <img v-if="activeSlide.type === 'image' || activeSlide.thumbnailUrl" :src="activeSlide.thumbnailUrl" class="main-img" />
                <div v-else-if="activeSlide.type === 'pptx'" class="pptx-placeholder slide-text-content">
                    <div v-if="activeSlide.thumbnailUrl" class="slide-bg-thumb">
                        <img :src="activeSlide.thumbnailUrl" />
                    </div>
                    <div class="slide-text-overlay">
                        <i class="fa-regular fa-file-powerpoint watermark"></i>
                        <pre>{{ activeSlide.content }}</pre>
                    </div>
                </div>
            </template>
            <div v-else class="empty-state">
                <i class="fa-regular fa-image" style="font-size: 48px; margin-bottom: 16px;"></i>
                <p>请粘贴 (Ctrl+V) 幻灯片截图或图片</p>
            </div>
          </div>
        </div>
      </main>

      <!-- Right Sidebar: Properties -->
      <aside class="sidebar-right">
        <div 
          v-for="(tool, index) in rightSidebarTools" 
          :key="index"
          class="right-tool-btn"
          :title="tool.name"
        >
          <span class="icon"><i :class="tool.icon"></i></span>
          <span class="label">{{ tool.name }}</span>
        </div>
      </aside>
    </div>

    <!-- Bottom Status Bar -->
    <footer class="status-bar">
      <div class="left-status">
        幻灯片 {{ activeSlide ? slides.findIndex(s => s.id === activeSlide?.id) + 1 : 0 }} / {{ slides.length }}
      </div>
      <div class="right-status">
        <button class="status-btn"><i class="fa-solid fa-stop"></i></button>
        <button class="status-btn"><i class="fa-solid fa-book-open"></i></button>
        <button class="status-btn"><i class="fa-solid fa-tv"></i></button>
        <div class="zoom-control">
          <button @click="zoomLevel = Math.max(10, zoomLevel - 10)">-</button>
          <span class="zoom-val">{{ zoomLevel }}%</span>
          <button @click="zoomLevel = Math.min(400, zoomLevel + 10)">+</button>
        </div>
      </div>
    </footer>

    <!-- AI Generation Modal -->
    <AIGenerateModal
      v-model="showAiModal"
      :current-slide-image="activeImage"
      @generate="handleAiGenerate"
      @generated-result="handleAiResult"
    />

    <!-- Preview Modal -->
    <div v-if="showPreviewModal" class="preview-overlay" @click.self="closePreview">
      <div class="preview-container">
        <div class="preview-header">
          <h3>生成结果预览</h3>
          <button class="close-btn" @click="closePreview">×</button>
        </div>
        <div class="preview-content-area">
          <iframe :srcdoc="previewHtml" class="preview-iframe"></iframe>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Preview Modal Styles */
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 3000;
}

.preview-container {
  background: #fff;
  width: 90%;
  max-width: 1300px;
  height: 90%;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.preview-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.close-btn:hover {
  color: #333;
}

.preview-content-area {
  flex: 1;
  background: #f5f5f5;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
}

.preview-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: #fff;
  transform-origin: center center;
}

@media (max-width: 1366px) {
  .preview-iframe {
    transform: scale(0.8);
  }
}

.presentation-editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  background-color: #f3f3f3;
  color: #333;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

/* Header & Ribbon */
.header {
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}

.tabs {
  display: flex;
  padding: 0 10px;
  background: #f3f3f3; /* Matches window title bar usually */
  border-bottom: 1px solid #ddd;
}

.tab {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  margin-top: 4px;
  border-radius: 4px 4px 0 0;
}

.tab:hover {
  background: #e6e6e6;
}

.tab.active {
  background: #fff;
  border-color: #ddd;
  font-weight: 600;
  color: #d32f2f; /* WPS reddish color or generic active color */
}

.toolbar {
  height: 60px; /* Reduced height for simplicity */
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: #fff;
  gap: 8px;
}

.tool-item {
  display: flex;
  align-items: center;
}

.separator {
  width: 1px;
  height: 24px;
  background: #ddd;
  margin: 0 8px;
}

.tool-btn {
  background: none;
  border: none;
  padding: 6px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: #444;
}

.tool-btn:hover {
  background: #f0f0f0;
}

.tool-btn .icon {
  font-size: 18px;
}

/* Main Layout */
.main-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Left Sidebar */
.sidebar-left {
  width: 240px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slide-thumbnail {
  display: flex;
  gap: 8px;
  cursor: pointer;
}

.slide-number {
  font-size: 12px;
  color: #888;
  width: 20px;
  text-align: right;
  padding-top: 4px;
}

.thumbnail-preview {
  width: 160px;
  height: 90px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 2px;
  position: relative;
  transition: all 0.2s;
}

.empty-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
}

.empty-sidebar .sub-text {
  font-size: 12px;
  color: #bbb;
  margin-top: 4px;
}

.delete-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slide-thumbnail:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: rgba(200, 0, 0, 0.8);
}

.slide-thumbnail.active .thumbnail-preview {
  border: 2px solid #d32f2f; /* Active highlight */
  box-shadow: 0 0 0 1px rgba(211, 47, 47, 0.2);
}

.preview-content {
  padding: 0;
  height: 100%;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f0f0f0;
}

.preview-file-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  color: #d24726;
  background: #fdfdfd;
}

.main-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.empty-state {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #999;
  font-size: 16px;
  background: #fff;
}

/* Canvas Area */
.canvas-area {
  flex: 1;
  background: #e8e8e8;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  position: relative;
}

.canvas-wrapper {
  margin: auto;
  padding: 40px;
  flex-shrink: 0;
}

.slide-canvas {
  width: 960px;
  height: 540px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* Right Sidebar */
.sidebar-right {
  width: 60px; /* Slim sidebar like in screenshot */
  background: #fff;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
}

.right-tool-btn {
  width: 48px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #555;
  font-size: 12px;
  gap: 4px;
}

.right-tool-btn:hover {
  background: #f5f5f5;
  border-radius: 4px;
}

.right-tool-btn .icon {
  font-size: 20px;
}

.right-tool-btn .label {
  font-size: 10px;
  transform: scale(0.9);
}

/* Status Bar */
.status-bar {
  height: 28px;
  background: #fff;
  border-top: 1px solid #ddd;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  font-size: 12px;
  color: #666;
}

.right-status {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 2px 4px;
}

.status-btn:hover {
  background: #eee;
  border-radius: 2px;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 4px;
}

.zoom-control button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  width: 20px;
  text-align: center;
}

.slide-text-content {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #fff;
}

.slide-bg-thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0.1;
  pointer-events: none;
}

.slide-bg-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.slide-text-overlay {
  position: relative;
  z-index: 2;
  padding: 40px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.watermark {
  position: absolute;
  bottom: 20px;
  right: 20px;
  font-size: 80px;
  color: #d24726;
  opacity: 0.1;
  pointer-events: none;
}

.slide-text-overlay pre {
  font-family: 'Segoe UI', sans-serif;
  font-size: 14px;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
  line-height: 1.6;
  margin: 0;
}

/* Modal Styles */
/* .modal-overlay, .modal-content, etc. removed as they are now in AIGenerateModal.vue */


.ai-btn {
  background: #e3f2fd;
  color: #1976d2;
  padding: 6px 12px;
}

.ai-btn:hover {
  background: #bbdefb;
}

.ai-btn .label {
  font-size: 12px;
  font-weight: 500;
}
</style>

