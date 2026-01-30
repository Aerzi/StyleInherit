<script setup lang="ts">
import { ref } from 'vue';
import AIGenerateModal from './AIGeneration/AIGenerateModal.vue';

const images = [
  '低对比度样张.png',
  '低对比度样张2.png',
  '星空正文总分页.png',
  '灰绿色正文页.png',
  '灰绿色饼状图正文页.png',
  '白底黑字——极简场景.png',
  '简单色彩样张.png',
  '粉紫色鱼骨图正文页.png',
  '红色正文图文页.png',
  '红色正文过渡页.png',
  '绿色正文分栏页.png',
  '蓝白色正文页.png',
  '蓝色SWOT正文页.png',
  '蓝色正文数据页.png',
  '蓝色正文页.png',
  '黑底白字——极简场景.png'
].map(name => ({
  id: name,
  url: `/assets/images/${name}`,
  name: name.replace('.png', '')
}));

const activeImage = ref(images[0]);
const zoomLevel = ref(100);

// AI Modal State
const showAiModal = ref(false);
const previewHtml = ref('');
const showPreviewModal = ref(false);

const toolbarTabs = [
  '开始', '插入', '审阅', '视图', '播放', '效率', 'WPS AI'
];
const activeTab = ref('开始');

const tools = [
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
      window.open(result.imageUrl, '_blank');
    }
    // alert('AI 生成成功！');
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
            <button v-else class="tool-btn" :title="tool.name">
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
    </header>

    <div class="main-container">
      <!-- Left Sidebar: Slides -->
      <aside class="sidebar-left">
        <div 
          v-for="(img, index) in images" 
          :key="img.id"
          class="slide-thumbnail"
          :class="{ active: activeImage.id === img.id }"
          @click="activeImage = img"
        >
          <div class="slide-number">{{ index + 1 }}</div>
          <div class="thumbnail-preview">
            <img :src="img.url" :alt="img.name" class="preview-img" loading="lazy" />
          </div>
        </div>
      </aside>

      <!-- Center: Canvas -->
      <main class="canvas-area">
        <div class="canvas-wrapper">
          <div class="slide-canvas" :style="{ transform: `scale(${zoomLevel / 100})` }">
            <img v-if="activeImage" :src="activeImage.url" :alt="activeImage.name" class="main-img" />
            <div v-else class="empty-state">请选择一张图片</div>
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
        幻灯片 {{ images.findIndex(s => s.id === activeImage.id) + 1 }} / {{ images.length }}
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

.slide-thumbnail:hover .thumbnail-preview {
  border-color: #aaa;
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

.preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
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
  justify-content: center;
  align-items: center;
  color: #999;
  font-size: 16px;
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
  padding: 40px;
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

.zoom-val {
  min-width: 40px;
  text-align: center;
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

