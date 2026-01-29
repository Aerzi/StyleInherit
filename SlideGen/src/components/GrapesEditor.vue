<script setup lang="ts">
/**
 * GrapesJS 编辑器组件
 * 需要先安装: npm install grapesjs
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

const props = defineProps<{
  html: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  save: [html: string];
  close: [];
}>();

const editorContainer = ref<HTMLDivElement | null>(null);
let editor: Editor | null = null;

// 初始化编辑器
function initEditor() {
  if (!editorContainer.value || editor) return;

  editor = grapesjs.init({
    container: editorContainer.value,
    height: "100%",
    width: "auto",
    fromElement: false,
    storageManager: false, // 禁用本地存储

    // 画布配置 - PPT 尺寸
    canvas: {
      styles: [
        // 加载外部样式
        "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
        "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap",
      ],
      scripts: [
        // 加载ECharts库，使图表能在编辑模式下显示
        "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js",
      ],
    },

    // 设备管理器 - PPT 固定尺寸
    deviceManager: {
      devices: [
        {
          name: "PPT",
          width: "1280px",
          height: "720px",
        },
      ],
    },

    // 面板配置
    panels: {
      defaults: [
        {
          id: "panel-top",
          el: ".panel__top",
        },
        {
          id: "basic-actions",
          el: ".panel__basic-actions",
          buttons: [
            {
              id: "visibility",
              active: true,
              className: "btn-toggle-borders",
              label: "📦",
              command: "sw-visibility",
              attributes: { title: "显示边框" },
            },
            {
              id: "export",
              className: "btn-open-export",
              label: "📤",
              command: "export-template",
              attributes: { title: "导出代码" },
            },
            {
              id: "undo",
              className: "btn-undo",
              label: "↩️",
              command: "core:undo",
              attributes: { title: "撤销" },
            },
            {
              id: "redo",
              className: "btn-redo",
              label: "↪️",
              command: "core:redo",
              attributes: { title: "重做" },
            },
            {
              id: "clear",
              className: "btn-clear",
              label: "🗑️",
              command: "core:canvas-clear",
              attributes: { title: "清空画布" },
            },
          ],
        },
        {
          id: "panel-devices",
          el: ".panel__devices",
          buttons: [
            {
              id: "device-ppt",
              label: "📊 PPT (1280×720)",
              command: "set-device-ppt",
              active: true,
              attributes: { title: "PPT 尺寸" },
            },
          ],
        },
      ],
    },

    // 样式管理器
    styleManager: {
      appendTo: ".styles-container",
      sectors: [
        {
          name: "尺寸",
          open: false,
          buildProps: [
            "width",
            "height",
            "min-width",
            "min-height",
            "max-width",
            "max-height",
            "padding",
            "margin",
          ],
        },
        {
          name: "排版",
          open: false,
          buildProps: [
            "font-family",
            "font-size",
            "font-weight",
            "letter-spacing",
            "color",
            "line-height",
            "text-align",
            "text-decoration",
            "text-shadow",
          ],
        },
        {
          name: "背景",
          open: false,
          buildProps: [
            "background-color",
            "background-image",
            "background-repeat",
            "background-position",
            "background-size",
          ],
        },
        {
          name: "边框",
          open: false,
          buildProps: ["border-radius", "border", "box-shadow"],
        },
        {
          name: "布局",
          open: false,
          buildProps: [
            "display",
            "flex-direction",
            "justify-content",
            "align-items",
            "gap",
            "position",
            "top",
            "right",
            "bottom",
            "left",
            "z-index",
          ],
        },
        {
          name: "其他",
          open: false,
          buildProps: ["opacity", "transform", "transition", "overflow"],
        },
      ],
    },

    // 图层管理器
    layerManager: {
      appendTo: ".layers-container",
    },

    // 选择器管理器
    selectorManager: {
      appendTo: ".selectors-container",
    },

    // 特性管理器
    traitManager: {
      appendTo: ".traits-container",
    },

    // 块管理器
    blockManager: {
      appendTo: ".blocks-container",
      blocks: [
        {
          id: "text",
          label: "文本",
          category: "基础",
          content: '<div data-gjs-type="text">在此输入文本</div>',
        },
        {
          id: "image",
          label: "图片",
          category: "基础",
          select: true,
          content: { type: "image" },
          activate: true,
        },
        {
          id: "box",
          label: "容器",
          category: "基础",
          content: '<div style="padding: 20px; min-height: 50px;"></div>',
        },
        {
          id: "section",
          label: "区块",
          category: "布局",
          content:
            '<section style="padding: 40px; min-height: 100px;"></section>',
        },
        {
          id: "flex-row",
          label: "横向布局",
          category: "布局",
          content:
            '<div style="display: flex; gap: 10px; padding: 10px;"><div style="flex: 1; padding: 20px;">列1</div><div style="flex: 1; padding: 20px;">列2</div></div>',
        },
        {
          id: "flex-col",
          label: "纵向布局",
          category: "布局",
          content:
            '<div style="display: flex; flex-direction: column; gap: 10px; padding: 10px;"><div style="padding: 20px;">行1</div><div style="padding: 20px;">行2</div></div>',
        },
      ],
    },
  });

  // 注册命令
  editor.Commands.add("set-device-ppt", {
    run: (editor) => editor.setDevice("PPT"),
  });

  // 自定义富文本编辑器工具栏 - 添加颜色和字号选项
  const rte = editor.RichTextEditor;

  // 添加文字颜色选择器（调色板）- 使用input事件实时生效
  rte.add("foreColor", {
    icon: `<input type="color" value="#000000" title="文字颜色" style="width:24px;height:20px;padding:0;border:none;cursor:pointer;background:transparent;">`,
    event: "input",
    result: (rte: any, action: any) => {
      const color = action.btn.querySelector("input").value;
      rte.exec("foreColor", color);
    },
  });

  // 添加背景颜色选择器（调色板）- 使用input事件实时生效
  rte.add("hiliteColor", {
    icon: `<input type="color" value="#ffff00" title="背景颜色" style="width:24px;height:20px;padding:0;border:1px solid #666;cursor:pointer;background:transparent;">`,
    event: "input",
    result: (rte: any, action: any) => {
      const color = action.btn.querySelector("input").value;
      rte.exec("hiliteColor", color);
    },
  });

  // 添加字号下拉选择器（14px-48px连续选项）
  const fontSizeOptions = Array.from({ length: 48 - 14 + 1 }, (_, i) => {
    const size = 14 + i;
    const selected = size === 16 ? " selected" : "";
    return `<option value="${size}"${selected}>${size}px</option>`;
  }).join("");

  rte.add("fontSize", {
    icon: `<select title="字号" style="height:22px;padding:0 2px;border:1px solid #666;border-radius:3px;background:#2a2a4a;color:#fff;cursor:pointer;font-size:11px;">
      ${fontSizeOptions}
    </select>`,
    event: "change",
    result: (rte: any, action: any) => {
      const size = action.btn.querySelector("select").value;
      const selection = rte.doc.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        if (selectedText) {
          // 删除选中内容并用带样式的span替换
          range.deleteContents();
          const span = rte.doc.createElement("span");
          span.style.fontSize = size + "px";
          span.textContent = selectedText;
          range.insertNode(span);
          // 重新选中插入的内容
          selection.removeAllRanges();
          const newRange = rte.doc.createRange();
          newRange.selectNodeContents(span);
          selection.addRange(newRange);
        }
      }
    },
  });

  // 添加字体下拉选择器
  rte.add("fontName", {
    icon: `<select title="字体" style="height:22px;width:90px;padding:0 2px;border:1px solid #666;border-radius:3px;background:#2a2a4a;color:#fff;cursor:pointer;font-size:11px;">
      <option value="Noto Sans SC" selected>思源黑体</option>
      <option value="Microsoft YaHei">微软雅黑</option>
      <option value="SimHei">黑体</option>
      <option value="SimSun">宋体</option>
      <option value="KaiTi">楷体</option>
      <option value="Arial">Arial</option>
      <option value="Georgia">Georgia</option>
      <option value="Times New Roman">Times</option>
    </select>`,
    event: "change",
    result: (rte: any, action: any) => {
      const font = action.btn.querySelector("select").value;
      rte.exec("fontName", font);
    },
  });

  // 加载 HTML 内容
  if (props.html) {
    loadHtml(props.html);
  }
}

// 加载 HTML 到编辑器
function loadHtml(html: string) {
  if (!editor) return;

  // 提取 body 内容和 style（使用贪婪匹配）
  let bodyContent = html;
  let styles = "";

  // 尝试提取 body 内容
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  }

  // 提取 style 标签
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (styleMatch) {
    styles = styleMatch
      .map((s) => s.replace(/<\/?style[^>]*>/gi, ""))
      .join("\n");
  }

  editor.setComponents(bodyContent);
  editor.setStyle(styles);
}

// 获取编辑后的完整 HTML
function getFullHtml(): string {
  if (!editor) return props.html;

  const html = editor.getHtml();
  const css = editor.getCss();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280, height=720">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; overflow: hidden; }
    ${css}
  </style>
</head>
<body>${html}</body>
</html>`;
}

// 保存并关闭
function handleSave() {
  const html = getFullHtml();
  emit("save", html);
}

// 关闭编辑器
function handleClose() {
  emit("close");
}

// 销毁编辑器
function destroyEditor() {
  if (editor) {
    editor.destroy();
    editor = null;
  }
}

// 监听 visible 变化
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      // 先销毁旧实例
      destroyEditor();
      await nextTick();
      await nextTick(); // 确保 DOM 更新完成
      initEditor();
    } else {
      destroyEditor();
    }
  }
);

// 监听 html 变化
watch(
  () => props.html,
  (html) => {
    if (editor && html && props.visible) {
      loadHtml(html);
    }
  }
);

onMounted(() => {
  if (props.visible) {
    initEditor();
  }
});

onUnmounted(() => {
  destroyEditor();
});
</script>

<template>
  <div v-if="visible" class="grapes-editor-wrapper">
    <!-- 顶部工具栏 -->
    <div class="editor-header">
      <div class="header-left">
        <span class="editor-title">📝 页面编辑器</span>
        <div class="panel__basic-actions"></div>
      </div>
      <div class="header-right">
        <button class="header-btn save-btn" @click="handleSave">💾 保存</button>
        <button class="header-btn close-btn" @click="handleClose">
          ✕ 关闭
        </button>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="editor-body">
      <!-- 左侧面板 - 块和图层 -->
      <div class="editor-sidebar left-sidebar">
        <div class="sidebar-tabs">
          <button class="tab-btn active" data-tab="blocks">组件</button>
          <button class="tab-btn" data-tab="layers">图层</button>
        </div>
        <div class="sidebar-content">
          <div class="blocks-container"></div>
          <div class="layers-container" style="display: none"></div>
        </div>
      </div>

      <!-- 中间画布 -->
      <div class="editor-canvas">
        <div class="panel__devices"></div>
        <div ref="editorContainer" class="gjs-editor-container"></div>
      </div>

      <!-- 右侧面板 - 样式和属性 -->
      <div class="editor-sidebar right-sidebar">
        <div class="sidebar-tabs">
          <button class="tab-btn active" data-tab="styles">样式</button>
          <button class="tab-btn" data-tab="traits">属性</button>
        </div>
        <div class="sidebar-content">
          <div class="selectors-container"></div>
          <div class="styles-container"></div>
          <div class="traits-container" style="display: none"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grapes-editor-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  background: #1a1a2e;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #16213e;
  border-bottom: 1px solid #0f3460;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  color: #e8e8e8;
}

.header-right {
  display: flex;
  gap: 8px;
}

.header-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn {
  background: #00ebbe;
  color: #000;
}

.save-btn:hover {
  background: #00d4aa;
}

.close-btn {
  background: #3a3a5c;
  color: #e8e8e8;
}

.close-btn:hover {
  background: #4a4a6c;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.editor-sidebar {
  width: 240px;
  background: #1e1e3f;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #0f3460;
}

.right-sidebar {
  border-right: none;
  border-left: 1px solid #0f3460;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid #0f3460;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #00ebbe;
  background: rgba(0, 235, 190, 0.1);
}

.tab-btn:hover {
  color: #e8e8e8;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}

.editor-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #2a2a4a;
}

.panel__devices {
  padding: 8px;
  background: #1e1e3f;
  border-bottom: 1px solid #0f3460;
  text-align: center;
}

.gjs-editor-container {
  flex: 1;
}

/* GrapesJS 变量覆盖 */
:deep(:root) {
  --gjs-left-width: 5%;
}

/* GrapesJS 主题覆盖 */
:deep(.gjs-one-bg) {
  background-color: #1a1a2e;
}

:deep(.gjs-two-color) {
  color: #e8e8e8;
}

:deep(.gjs-three-bg) {
  background-color: #1e1e3f;
}

:deep(.gjs-four-color),
:deep(.gjs-four-color-h:hover) {
  color: #00ebbe;
}

:deep(.gjs-pn-btn) {
  padding: 6px 10px;
  margin: 2px;
  border-radius: 4px;
  font-size: 14px;
}

:deep(.gjs-pn-btn:hover) {
  background: rgba(0, 235, 190, 0.2);
}

:deep(.gjs-pn-active) {
  background: rgba(0, 235, 190, 0.3);
}

:deep(.gjs-block) {
  padding: 10px;
  margin: 4px;
  border-radius: 4px;
  background: #2a2a4a;
  border: 1px solid #3a3a5c;
}

:deep(.gjs-block:hover) {
  border-color: #00ebbe;
}

:deep(.gjs-sm-sector-title) {
  background: #1a1a2e;
  color: #e8e8e8;
  padding: 10px;
}

:deep(.gjs-field) {
  background: #2a2a4a;
  border: 1px solid #3a3a5c;
  border-radius: 4px;
}

:deep(.gjs-field input) {
  color: #e8e8e8;
}

:deep(.gjs-cv-canvas) {
  background: #2a2a4a;
}

/* 画布帧样式 - 强制PPT尺寸 */
:deep(.gjs-frame-wrapper) {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

:deep(.gjs-frame) {
  width: 1280px !important;
  height: 720px !important;

  top: 100px !important;
}

/* RTE 富文本编辑器工具栏样式 */
:deep(.gjs-rte-toolbar) {
  display: flex !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px 12px !important;
  min-width: max-content !important;
  width: auto !important;
  background: #1a1a2e !important;
  border: 1px solid #3a3a5c !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
}

:deep(.gjs-rte-action) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  flex-shrink: 0 !important;
  min-width: 25px !important;
  margin: 0 !important;
  padding: 2px !important;
}

:deep(.gjs-rte-action select) {
  min-width: 80px !important;
  flex-shrink: 0 !important;
}

:deep(.gjs-rte-action input[type="color"]) {
  width: 28px !important;
  height: 24px !important;
  flex-shrink: 0 !important;
}
</style>
