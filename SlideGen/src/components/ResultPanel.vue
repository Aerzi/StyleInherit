<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from "vue";
import type { SlideResult } from "../services/llmService";
import {
  checkLayoutInIframe,
  type LayoutCheckResult,
} from "../utils/layout-checker";

// 编辑器组件
import GrapesEditor from "./GrapesEditor.vue";

// 批量结果项类型
interface BatchResultItem {
  prompt: string;
  originalSlide: SlideResult | null;
  fixedSlide: SlideResult | null;
  duration: number;
  hasLayoutFix: boolean;
  status: "pending" | "generating" | "fixing" | "done" | "error";
  errorMessage?: string;
  originalLayoutErrors?: number; // 原始结果爆版错误数
  originalLayoutDetails?: string[]; // 原始结果爆版错误详情
  fixedLayoutErrors?: number; // 修复结果爆版错误数
  fixedLayoutDetails?: string[]; // 修复结果爆版错误详情
  fixErrorMessage?: string; // 修复失败错误信息
  imageDiff?: number; // 图片差异度百分比 (-1 表示对比失败)
}

const props = defineProps<{
  status: "idle" | "loading" | "success" | "error";
  slides: SlideResult[];
  currentIndex: number;
  errorMessage: string;
  fixedSlide?: SlideResult | null;
  isFixing?: boolean;
  fixStreamContent?: string;
  loopCount?: number;
  batchResults?: BatchResultItem[];
  currentBatchIndex?: number;
}>();

const emit = defineEmits<{
  "update:current-index": [index: number];
  export: [];
  "export-fixed": [];
  "export-batch-item": [index: number, type: "original" | "fixed"];
}>();

// ========== iframe 引用 ==========
const slideIframeRef = ref<HTMLIFrameElement | null>(null);
const fixedIframeRef = ref<HTMLIFrameElement | null>(null);
const fullscreenIframeRef = ref<HTMLIFrameElement | null>(null);

// ========== 编辑后的 HTML 存储 ==========
const editedHtmlMap = ref<Map<string, string>>(new Map());

// 获取编辑后的 HTML
function getEditedHtml(originalHtml: string, key: string): string {
  return editedHtmlMap.value.get(key) || originalHtml;
}

// 获取当前编辑 key
function getCurrentEditKey(): string {
  if (fullscreenItem.value && props.batchResults) {
    return `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
  }
  return `slide_${props.currentIndex}`;
}

// 重置为原始 HTML
function resetToOriginal() {
  const key = getCurrentEditKey();
  editedHtmlMap.value.delete(key);
}

// 下载当前 HTML
function downloadCurrentHtml() {
  let html = "";
  let filename = "slide.html";

  if (fullscreenItem.value && props.batchResults) {
    const item = props.batchResults[fullscreenItem.value.index];
    const slide =
      fullscreenItem.value.type === "original"
        ? item?.originalSlide
        : item?.fixedSlide;
    const key = `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
    html = getEditedHtml(slide?.html || "", key);
    filename = `slide_${fullscreenItem.value.index + 1}_${
      fullscreenItem.value.type
    }.html`;
  } else if (props.slides.length > 0) {
    const slide = props.slides[props.currentIndex];
    const key = `slide_${props.currentIndex}`;
    html = getEditedHtml(slide?.html || "", key);
    filename = `slide_${props.currentIndex + 1}.html`;
  }

  if (!html) return;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== 全屏预览 ==========
const fullscreenItem = ref<{
  index: number;
  type: "original" | "fixed";
} | null>(null);
const fullscreenViewMode = ref<"preview" | "code">("preview");

// ========== GrapesJS 编辑器 ==========
const showGrapesEditor = ref(false);
const grapesEditorHtml = ref("");

// 打开 GrapesJS 编辑器
function openGrapesEditor() {
  let html = "";

  // 优先使用全屏模式的内容
  if (fullscreenItem.value && props.batchResults) {
    const item = props.batchResults[fullscreenItem.value.index];
    const slide =
      fullscreenItem.value.type === "original"
        ? item?.originalSlide
        : item?.fixedSlide;
    const key = `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
    html = getEditedHtml(slide?.html || "", key);
  }
  // 单幻灯片模式 - 使用 currentSlideHtml
  else if (currentSlideHtml.value) {
    html = currentSlideHtml.value;
  }
  // 兜底：直接从 props.slides 获取
  else if (props.slides.length > 0 && props.slides[props.currentIndex]) {
    const slide = props.slides[props.currentIndex];
    const key = `slide_${props.currentIndex}`;
    html = getEditedHtml(slide.html || "", key);
  }

  console.log("Opening GrapesJS with HTML length:", html.length);
  grapesEditorHtml.value = html;
  showGrapesEditor.value = true;
}

// 保存 GrapesJS 编辑结果
function handleGrapesSave(html: string) {
  // 保存到 editedHtmlMap
  if (fullscreenItem.value && props.batchResults) {
    const key = `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
    editedHtmlMap.value.set(key, html);
  } else if (props.slides.length > 0) {
    const key = `slide_${props.currentIndex}`;
    editedHtmlMap.value.set(key, html);
  }

  showGrapesEditor.value = false;
}

// 关闭 GrapesJS 编辑器
function closeGrapesEditor() {
  showGrapesEditor.value = false;
}

function openFullscreen(index: number, type: "original" | "fixed") {
  fullscreenItem.value = { index, type };
  fullscreenViewMode.value = "preview";
  showFullscreenCheckPanel.value = false;
}

function closeFullscreen() {
  fullscreenItem.value = null;
  showFullscreenCheckPanel.value = false;
}

function toggleFullscreenViewMode() {
  fullscreenViewMode.value =
    fullscreenViewMode.value === "preview" ? "code" : "preview";
}

// ESC 关闭全屏
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && fullscreenItem.value) {
    closeFullscreen();
  }
}

// ========== 布局检测 (全屏) ==========
const showFullscreenCheckPanel = ref(false);
const fullscreenCheckResult = ref<LayoutCheckResult | null>(null);
const isCheckingFullscreen = ref(false);
const highlightedFullscreenIssueIndex = ref<number | null>(null);

async function runFullscreenLayoutCheck() {
  if (!fullscreenIframeRef.value) return;

  isCheckingFullscreen.value = true;
  showFullscreenCheckPanel.value = true;

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 500));

  fullscreenCheckResult.value = checkLayoutInIframe(fullscreenIframeRef.value);
  isCheckingFullscreen.value = false;
}

function closeFullscreenCheckPanel() {
  showFullscreenCheckPanel.value = false;
  clearFullscreenHighlight();
}

function highlightFullscreenIssue(index: number) {
  if (!fullscreenIframeRef.value?.contentDocument) return;

  const issue = fullscreenCheckResult.value?.issues[index];
  if (!issue?.selector) return;

  if (highlightedFullscreenIssueIndex.value === index) {
    clearFullscreenHighlight();
    return;
  }

  highlightedFullscreenIssueIndex.value = index;
  const doc = fullscreenIframeRef.value.contentDocument;

  const oldStyle = doc.getElementById("__layout-check-highlight__");
  oldStyle?.remove();

  const style = doc.createElement("style");
  style.id = "__layout-check-highlight__";
  style.textContent = `
    ${issue.selector} {
      outline: 3px solid #ff4444 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(255, 68, 68, 0.3) !important;
    }
  `;
  doc.head.appendChild(style);
}

function clearFullscreenHighlight() {
  highlightedFullscreenIssueIndex.value = null;
  if (!fullscreenIframeRef.value?.contentDocument) return;

  const oldStyle = fullscreenIframeRef.value.contentDocument.getElementById(
    "__layout-check-highlight__"
  );
  oldStyle?.remove();
}

// 获取全屏预览的代码
const fullscreenCode = computed(() => {
  if (!fullscreenItem.value || !props.batchResults) return "";
  const item = props.batchResults[fullscreenItem.value.index];
  if (!item) return "";
  const slide =
    fullscreenItem.value.type === "original"
      ? item.originalSlide
      : item.fixedSlide;
  if (!slide) return "";
  const key = `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
  return editedHtmlMap.value.get(key) || slide.html;
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// 包装 HTML 为完整文档
function wrapSlideHtml(html: string): string {
  if (
    html.trim().toLowerCase().startsWith("<!doctype") ||
    html.trim().toLowerCase().startsWith("<html")
  ) {
    return html;
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280, height=720">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; overflow: hidden; }
  </style>
</head>
<body>${html}</body>
</html>`;
}

// 获取全屏预览的 HTML
const fullscreenHtml = computed(() => {
  if (!fullscreenItem.value || !props.batchResults) return "";
  const item = props.batchResults[fullscreenItem.value.index];
  if (!item) return "";
  const slide =
    fullscreenItem.value.type === "original"
      ? item.originalSlide
      : item.fixedSlide;
  if (!slide) return "";
  const key = `batch_${fullscreenItem.value.index}_${fullscreenItem.value.type}`;
  const html = editedHtmlMap.value.get(key) || slide.html;
  return wrapSlideHtml(html);
});

const currentSlide = computed(() => props.slides[props.currentIndex]);

// 获取当前幻灯片的 HTML（考虑编辑后的版本）
const currentSlideHtml = computed(() => {
  const slide = currentSlide.value;
  if (!slide) return "";
  const key = `slide_${props.currentIndex}`;
  return editedHtmlMap.value.get(key) || slide.html;
});

// 预览模式：preview（HTML预览）或 code（代码）
const viewMode = ref<"preview" | "code">("preview");
const fixedViewMode = ref<"preview" | "code">("preview");

// 排版检测
const showCheckPanel = ref(false);
const checkResult = ref<LayoutCheckResult | null>(null);
const isChecking = ref(false);
const highlightedIssueIndex = ref<number | null>(null);

// 修复结果排版检测
const showFixedCheckPanel = ref(false);
const fixedCheckResult = ref<LayoutCheckResult | null>(null);
const isCheckingFixed = ref(false);

function toggleViewMode() {
  viewMode.value = viewMode.value === "preview" ? "code" : "preview";
}

function toggleFixedViewMode() {
  fixedViewMode.value = fixedViewMode.value === "preview" ? "code" : "preview";
}

async function runLayoutCheck() {
  if (!slideIframeRef.value) return;

  isChecking.value = true;
  showCheckPanel.value = true;

  // 等待 iframe 渲染完成
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 500));

  checkResult.value = checkLayoutInIframe(slideIframeRef.value);
  isChecking.value = false;
}

function closeCheckPanel() {
  showCheckPanel.value = false;
  clearHighlight();
}

// 修复结果排版检测
async function runFixedLayoutCheck() {
  if (!fixedIframeRef.value) return;

  isCheckingFixed.value = true;
  showFixedCheckPanel.value = true;

  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 500));

  fixedCheckResult.value = checkLayoutInIframe(fixedIframeRef.value);
  isCheckingFixed.value = false;
}

function closeFixedCheckPanel() {
  showFixedCheckPanel.value = false;
}

// 高亮问题元素
function highlightIssue(index: number) {
  if (!slideIframeRef.value?.contentDocument) return;

  const issue = checkResult.value?.issues[index];
  if (!issue?.selector) return;

  // 切换高亮状态
  if (highlightedIssueIndex.value === index) {
    clearHighlight();
    return;
  }

  highlightedIssueIndex.value = index;
  const doc = slideIframeRef.value.contentDocument;

  // 移除旧的高亮样式
  const oldStyle = doc.getElementById("__layout-check-highlight__");
  oldStyle?.remove();

  // 创建新的高亮样式
  const style = doc.createElement("style");
  style.id = "__layout-check-highlight__";
  style.textContent = `
    ${issue.selector} {
      outline: 3px solid #ff4444 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(255, 68, 68, 0.3) !important;
    }
  `;
  doc.head.appendChild(style);
}

function clearHighlight() {
  highlightedIssueIndex.value = null;
  if (!slideIframeRef.value?.contentDocument) return;

  const oldStyle = slideIframeRef.value.contentDocument.getElementById(
    "__layout-check-highlight__"
  );
  oldStyle?.remove();
}

// 监听 iframe 消息和键盘事件
onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
});

// 当切换幻灯片时关闭编辑器
watch(
  () => props.currentIndex,
  () => {
    showGrapesEditor.value = false;
  }
);
</script>

<template>
  <div class="result-panel">
    <!-- 空状态 -->
    <div v-if="status === 'idle'" class="empty-state">
      <div class="empty-icon">📊</div>
      <h2>开始创建你的 PPT</h2>
      <p>在左侧输入主题描述，AI 将为你生成精美的 HTML 演示文稿</p>
      <div class="feature-grid">
        <div class="feature-item">
          <span class="f-icon">🎨</span>
          <span class="f-text">多种风格模板</span>
        </div>
        <div class="feature-item">
          <span class="f-icon">📐</span>
          <span class="f-text">1280×720 标准尺寸</span>
        </div>
        <div class="feature-item">
          <span class="f-icon">🚀</span>
          <span class="f-text">流式实时生成</span>
        </div>
        <div class="feature-item">
          <span class="f-icon">📤</span>
          <span class="f-text">一键导出 HTML</span>
        </div>
      </div>
    </div>

    <!-- 加载状态（表格还没有数据时显示） -->
    <div
      v-else-if="
        status === 'loading' && !(batchResults && batchResults.length > 0)
      "
      class="loading-state"
    >
      <div class="loading-animation">
        <div class="pulse-ring"></div>
        <div class="pulse-ring delay-1"></div>
        <div class="pulse-ring delay-2"></div>
        <div class="center-dot"></div>
      </div>
      <h2>正在生成中...</h2>
      <p>生成进度：{{ (currentBatchIndex || 0) + 1 }} / {{ loopCount }}</p>
      <!-- 进度条 -->
      <div class="batch-progress">
        <div
          v-for="idx in loopCount"
          :key="idx"
          class="batch-dot"
          :class="{
            done: batchResults?.[idx - 1]?.status === 'done',
            current: idx - 1 === currentBatchIndex,
            error: batchResults?.[idx - 1]?.status === 'error',
          }"
        ></div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="status === 'error'" class="error-state">
      <div class="error-icon">⚠️</div>
      <h2>生成失败</h2>
      <p>{{ errorMessage || "发生未知错误，请重试" }}</p>
    </div>

    <!-- 表格结果视图（生成中或完成） -->
    <div
      v-else-if="
        (status === 'success' || status === 'loading') &&
        batchResults &&
        batchResults.length > 0
      "
      class="batch-state"
    >
      <div class="batch-table-wrapper">
        <table class="batch-table">
          <thead>
            <tr>
              <th class="col-index">#</th>
              <th class="col-prompt">Prompt</th>
              <th class="col-preview">原始结果</th>
              <th class="col-layout">原始爆版</th>
              <th class="col-preview">修复结果</th>
              <th class="col-layout">修复爆版</th>
              <th class="col-diff">差异度</th>
              <th class="col-duration">耗时</th>
              <th class="col-status">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(item, idx) in batchResults"
              :key="idx"
              :class="{ current: idx === currentBatchIndex }"
            >
              <td class="col-index">{{ idx + 1 }}</td>
              <td class="col-prompt">
                <div class="prompt-cell" :title="item.prompt">
                  {{ item.prompt.slice(0, 50)
                  }}{{ item.prompt.length > 50 ? "..." : "" }}
                </div>
              </td>
              <td class="col-preview">
                <div
                  v-if="item.originalSlide"
                  class="mini-preview"
                  @click="openFullscreen(idx, 'original')"
                >
                  <iframe
                    :srcdoc="wrapSlideHtml(item.originalSlide.html)"
                    class="mini-iframe"
                    sandbox="allow-same-origin allow-scripts"
                  ></iframe>
                  <div class="preview-overlay">
                    <span class="preview-expand">🔍 点击放大</span>
                  </div>
                </div>
                <div
                  v-else-if="item.status === 'generating'"
                  class="mini-loading"
                >
                  <span class="mini-spinner"></span>
                </div>
                <div
                  v-else-if="item.status === 'error'"
                  class="mini-error"
                  :title="item.errorMessage || '生成失败'"
                >
                  ❌
                  <span class="error-hint"
                    >{{ item.errorMessage?.slice(0, 20) || "失败"
                    }}{{
                      (item.errorMessage?.length || 0) > 20 ? "..." : ""
                    }}</span
                  >
                </div>
                <div v-else class="mini-pending">-</div>
              </td>
              <td class="col-layout">
                <span
                  v-if="item.originalLayoutErrors !== undefined"
                  class="layout-badge"
                  :class="{
                    error: item.originalLayoutErrors > 0,
                    ok: item.originalLayoutErrors === 0,
                  }"
                  :title="item.originalLayoutDetails?.join('\n') || ''"
                >
                  {{
                    item.originalLayoutErrors > 0
                      ? `❌ ${item.originalLayoutErrors}`
                      : "✅"
                  }}
                </span>
                <span v-else class="layout-pending">-</span>
              </td>
              <td class="col-preview">
                <div
                  v-if="item.fixedSlide"
                  class="mini-preview fixed"
                  @click="openFullscreen(idx, 'fixed')"
                >
                  <iframe
                    :srcdoc="wrapSlideHtml(item.fixedSlide.html)"
                    class="mini-iframe"
                    sandbox="allow-same-origin allow-scripts"
                  ></iframe>
                  <div class="preview-overlay">
                    <span class="preview-expand">🔍 点击放大</span>
                  </div>
                </div>
                <div v-else-if="item.status === 'fixing'" class="mini-loading">
                  <span class="mini-spinner"></span>
                </div>
                <div
                  v-else-if="
                    item.originalLayoutErrors === 0 && item.status === 'done'
                  "
                  class="mini-ok"
                >
                  ✅ 无需修复
                </div>
                <div
                  v-else-if="
                    item.originalLayoutErrors !== undefined &&
                    item.originalLayoutErrors > 0 &&
                    !item.fixedSlide &&
                    item.status === 'done'
                  "
                  class="mini-error"
                  :title="item.fixErrorMessage || '修复失败'"
                >
                  ❌
                  <span class="error-hint"
                    >{{ item.fixErrorMessage?.slice(0, 30) || "修复失败"
                    }}{{
                      (item.fixErrorMessage?.length || 0) > 30 ? "..." : ""
                    }}</span
                  >
                </div>
                <div v-else class="mini-pending">-</div>
              </td>
              <td class="col-layout">
                <span
                  v-if="item.fixedLayoutErrors !== undefined"
                  class="layout-badge"
                  :class="{
                    error: item.fixedLayoutErrors > 0,
                    ok: item.fixedLayoutErrors === 0,
                  }"
                  :title="item.fixedLayoutDetails?.join('\n') || ''"
                >
                  {{
                    item.fixedLayoutErrors > 0
                      ? `❌ ${item.fixedLayoutErrors}`
                      : "✅"
                  }}
                </span>
                <span v-else-if="item.fixedSlide" class="layout-pending"
                  >-</span
                >
                <span v-else class="layout-na">-</span>
              </td>
              <td class="col-diff">
                <span
                  v-if="item.imageDiff !== undefined && item.imageDiff >= 0"
                  class="diff-badge"
                  :class="{
                    low: item.imageDiff < 5,
                    medium: item.imageDiff >= 5 && item.imageDiff < 20,
                    high: item.imageDiff >= 20,
                  }"
                  :title="`差异像素占比: ${item.imageDiff.toFixed(2)}%`"
                >
                  {{
                    item.imageDiff < 1
                      ? "< 1%"
                      : `${item.imageDiff.toFixed(1)}%`
                  }}
                </span>
                <span
                  v-else-if="item.imageDiff !== undefined && item.imageDiff < 0"
                  class="diff-error"
                  title="对比失败"
                >
                  ⚠️
                </span>
                <span v-else-if="item.fixedSlide" class="diff-pending">-</span>
                <span v-else class="diff-na">-</span>
              </td>
              <td class="col-duration">
                {{ item.duration > 0 ? formatDuration(item.duration) : "-" }}
              </td>
              <td class="col-status">
                <span class="status-badge" :class="item.status">
                  {{
                    item.status === "pending"
                      ? "⏳ 等待"
                      : item.status === "generating"
                      ? "🔄 生成中"
                      : item.status === "fixing"
                      ? "🔧 修复中"
                      : item.status === "done"
                      ? "✅ 完成"
                      : "❌ 失败"
                  }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 全屏预览弹窗 -->
      <div
        v-if="fullscreenItem"
        class="fullscreen-modal"
        @click.self="closeFullscreen"
      >
        <div class="fullscreen-content">
          <div class="fullscreen-header">
            <span class="fullscreen-title">
              {{
                fullscreenItem.type === "original"
                  ? "📄 原始结果"
                  : "✨ 修复结果"
              }}
              - #{{ fullscreenItem.index + 1 }}
            </span>
            <div class="fullscreen-actions">
              <button
                class="fullscreen-btn grapes-btn"
                @click="openGrapesEditor"
                :disabled="fullscreenViewMode !== 'preview'"
                title="使用 GrapesJS 可视化编辑器"
              >
                ✏️ 编辑
              </button>
              <button
                class="fullscreen-btn reset-btn"
                @click="resetToOriginal"
                title="重置为原始内容"
              >
                ↺ 重置
              </button>
              <button class="fullscreen-btn" @click="toggleFullscreenViewMode">
                {{ fullscreenViewMode === "preview" ? "{ } 代码" : "👁 预览" }}
              </button>
              <button class="fullscreen-btn" @click="downloadCurrentHtml">
                📤 下载
              </button>
              <button
                class="fullscreen-btn"
                @click="runFullscreenLayoutCheck"
                :disabled="fullscreenViewMode !== 'preview'"
              >
                🔍 检测
              </button>
              <button class="fullscreen-close" @click="closeFullscreen">
                ✕
              </button>
            </div>
          </div>
          <div class="fullscreen-iframe-container">
            <!-- 预览模式 -->
            <iframe
              v-if="fullscreenViewMode === 'preview' && fullscreenHtml"
              ref="fullscreenIframeRef"
              :srcdoc="fullscreenHtml"
              class="fullscreen-iframe"
              sandbox="allow-same-origin allow-scripts"
            ></iframe>
            <!-- 代码模式 -->
            <div
              v-else-if="fullscreenViewMode === 'code'"
              class="fullscreen-code-container"
            >
              <pre
                class="fullscreen-code-view"
              ><code>{{ fullscreenCode }}</code></pre>
            </div>

            <!-- 排版检测结果面板 -->
            <div v-if="showFullscreenCheckPanel" class="fullscreen-check-panel">
              <div class="check-panel-header">
                <span class="check-panel-title">排版检测结果</span>
                <button
                  class="check-panel-close"
                  @click="closeFullscreenCheckPanel"
                >
                  ✕
                </button>
              </div>
              <div class="check-panel-content">
                <div v-if="isCheckingFullscreen" class="check-loading">
                  <span class="check-spinner"></span>
                  检测中...
                </div>
                <template v-else-if="fullscreenCheckResult">
                  <div
                    class="check-summary"
                    :class="{
                      passed: fullscreenCheckResult.passed,
                      failed: !fullscreenCheckResult.passed,
                    }"
                  >
                    <span v-if="fullscreenCheckResult.passed">✅ 检测通过</span>
                    <span v-else>
                      ❌ 发现
                      {{ fullscreenCheckResult.summary.errors }} 个错误，
                      {{ fullscreenCheckResult.summary.warnings }} 个警告
                    </span>
                  </div>
                  <div
                    v-if="fullscreenCheckResult.issues.length > 0"
                    class="check-issues"
                  >
                    <div
                      v-for="(issue, idx) in fullscreenCheckResult.issues"
                      :key="idx"
                      class="check-issue"
                      :class="[
                        issue.severity,
                        { active: highlightedFullscreenIssueIndex === idx },
                        { invisible: issue.isInvisible },
                      ]"
                      @click="issue.selector && highlightFullscreenIssue(idx)"
                      :style="{
                        cursor: issue.selector ? 'pointer' : 'default',
                      }"
                    >
                      <div class="issue-header">
                        <span class="issue-icon">
                          {{
                            issue.isInvisible
                              ? "👻"
                              : issue.severity === "error"
                              ? "🔴"
                              : issue.severity === "warning"
                              ? "🟡"
                              : "🔵"
                          }}
                        </span>
                        <span class="issue-message">{{ issue.message }}</span>
                      </div>
                      <div class="issue-element">{{ issue.element }}</div>
                      <div v-if="issue.details" class="issue-details">
                        {{ issue.details }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="check-empty">没有发现排版问题 🎉</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 成功状态 - 单次预览 -->
    <div
      v-else-if="status === 'success' && slides.length > 0"
      class="preview-state"
    >
      <!-- 预览区域容器 -->
      <div
        class="preview-list"
        :class="{ 'has-fixed': fixedSlide || isFixing }"
      >
        <!-- 原始结果 -->
        <div class="preview-item">
          <div class="preview-label original">📄 原始结果</div>
          <div class="preview-area">
            <!-- 顶部工具条 -->
            <div v-if="viewMode === 'preview'" class="top-toolbar">
              <div class="toolbar-left">
                <!-- 文本编辑 (Quill) -->
                <button
                  class="toolbar-btn grapes-btn"
                  @click="openGrapesEditor"
                  title="使用 GrapesJS 可视化编辑器"
                >
                  <span class="btn-icon">✏️</span>
                  <span class="btn-text">编辑</span>
                </button>
              </div>

              <div class="toolbar-center"></div>

              <div class="toolbar-right">
                <!-- 重置 -->
                <button
                  class="toolbar-btn reset-btn"
                  @click="resetToOriginal"
                  title="重置为原始内容"
                >
                  <span class="btn-icon">↺</span>
                  <span class="btn-text">重置</span>
                </button>

                <!-- 查看代码 -->
                <button
                  class="toolbar-btn"
                  @click="toggleViewMode"
                  title="查看代码"
                >
                  <span class="btn-icon">{ }</span>
                  <span class="btn-text">代码</span>
                </button>

                <!-- 导出 -->
                <button
                  class="toolbar-btn"
                  @click="downloadCurrentHtml"
                  title="下载 HTML"
                >
                  <span class="btn-icon">📤</span>
                  <span class="btn-text">下载</span>
                </button>

                <!-- 排版检测 -->
                <button
                  class="toolbar-btn"
                  @click="runLayoutCheck"
                  title="排版检测"
                >
                  <span class="btn-icon">🔍</span>
                  <span class="btn-text">检测</span>
                </button>
              </div>
            </div>

            <!-- 代码模式顶部工具条 -->
            <div v-else class="top-toolbar">
              <div class="toolbar-left">
                <span class="toolbar-title">代码视图</span>
              </div>
              <div class="toolbar-right">
                <button
                  class="toolbar-btn"
                  @click="toggleViewMode"
                  title="返回预览"
                >
                  <span class="btn-icon">👁</span>
                  <span class="btn-text">预览</span>
                </button>
                <button
                  class="toolbar-btn"
                  @click="downloadCurrentHtml"
                  title="下载 HTML"
                >
                  <span class="btn-icon">📤</span>
                  <span class="btn-text">下载</span>
                </button>
              </div>
            </div>

            <!-- HTML 预览模式 -->
            <div v-if="viewMode === 'preview'" class="slide-container">
              <iframe
                ref="slideIframeRef"
                v-if="currentSlide"
                :srcdoc="wrapSlideHtml(currentSlideHtml)"
                class="slide-iframe"
                sandbox="allow-same-origin allow-scripts"
              ></iframe>
            </div>

            <!-- 代码模式 -->
            <div v-else class="code-container">
              <pre
                class="code-view"
              ><code>{{ currentSlideHtml || '' }}</code></pre>
            </div>

            <!-- 排版检测结果面板 -->
            <div v-if="showCheckPanel" class="check-panel">
              <div class="check-panel-header">
                <span class="check-panel-title">排版检测结果</span>
                <button class="check-panel-close" @click="closeCheckPanel">
                  ✕
                </button>
              </div>
              <div class="check-panel-content">
                <div v-if="isChecking" class="check-loading">
                  <span class="check-spinner"></span>
                  检测中...
                </div>
                <template v-else-if="checkResult">
                  <div
                    class="check-summary"
                    :class="{
                      passed: checkResult.passed,
                      failed: !checkResult.passed,
                    }"
                  >
                    <span v-if="checkResult.passed">✅ 检测通过</span>
                    <span v-else>
                      ❌ 发现 {{ checkResult.summary.errors }} 个错误，
                      {{ checkResult.summary.warnings }} 个警告
                    </span>
                  </div>
                  <div
                    v-if="checkResult.issues.length > 0"
                    class="check-issues"
                  >
                    <div
                      v-for="(issue, idx) in checkResult.issues"
                      :key="idx"
                      class="check-issue"
                      :class="[
                        issue.severity,
                        { active: highlightedIssueIndex === idx },
                        { invisible: issue.isInvisible },
                      ]"
                      @click="issue.selector && highlightIssue(idx)"
                      :style="{
                        cursor: issue.selector ? 'pointer' : 'default',
                      }"
                    >
                      <div class="issue-header">
                        <span class="issue-icon">
                          {{
                            issue.isInvisible
                              ? "👻"
                              : issue.severity === "error"
                              ? "🔴"
                              : issue.severity === "warning"
                              ? "🟡"
                              : "🔵"
                          }}
                        </span>
                        <span class="issue-message">{{ issue.message }}</span>
                      </div>
                      <div class="issue-element">{{ issue.element }}</div>
                      <div v-if="issue.details" class="issue-details">
                        {{ issue.details }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="check-empty">没有发现排版问题 🎉</div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 修复结果 -->
        <div v-if="fixedSlide || isFixing" class="preview-item fixed">
          <div class="preview-label fixed">✨ 修复结果</div>
          <div class="preview-area">
            <div v-if="isFixing" class="fixing-state">
              <div class="fixing-animation">
                <span class="fixing-spinner"></span>
              </div>
              <p>正在修复排版问题...</p>
              <pre v-if="fixStreamContent" class="fix-stream">{{
                fixStreamContent.slice(-500)
              }}</pre>
            </div>
            <template v-else-if="fixedSlide">
              <!-- 修复结果顶部工具条 -->
              <div class="top-toolbar">
                <div class="toolbar-left">
                  <span class="toolbar-title">{{
                    fixedViewMode === "preview" ? "预览" : "代码"
                  }}</span>
                </div>
                <div class="toolbar-right">
                  <button
                    class="toolbar-btn"
                    @click="toggleFixedViewMode"
                    :title="
                      fixedViewMode === 'preview' ? '查看代码' : '查看预览'
                    "
                  >
                    <span class="btn-icon">{{
                      fixedViewMode === "preview" ? "{ }" : "👁"
                    }}</span>
                    <span class="btn-text">{{
                      fixedViewMode === "preview" ? "代码" : "预览"
                    }}</span>
                  </button>
                  <button
                    class="toolbar-btn"
                    @click="emit('export-fixed')"
                    title="导出修复后的 HTML"
                  >
                    <span class="btn-icon">📤</span>
                    <span class="btn-text">导出</span>
                  </button>
                  <button
                    class="toolbar-btn"
                    @click="runFixedLayoutCheck"
                    title="排版检测"
                    :disabled="fixedViewMode !== 'preview'"
                  >
                    <span class="btn-icon">🔍</span>
                    <span class="btn-text">检测</span>
                  </button>
                </div>
              </div>

              <!-- 修复结果预览模式 -->
              <div v-if="fixedViewMode === 'preview'" class="slide-container">
                <iframe
                  ref="fixedIframeRef"
                  :srcdoc="wrapSlideHtml(fixedSlide.html)"
                  class="slide-iframe"
                  sandbox="allow-same-origin allow-scripts"
                ></iframe>
              </div>
              <!-- 修复结果代码模式 -->
              <div v-else class="code-container">
                <pre class="code-view"><code>{{ fixedSlide.html }}</code></pre>
              </div>
            </template>

            <!-- 修复结果排版检测面板 -->
            <div v-if="showFixedCheckPanel" class="check-panel">
              <div class="check-panel-header">
                <span class="check-panel-title">修复结果检测</span>
                <button class="check-panel-close" @click="closeFixedCheckPanel">
                  ✕
                </button>
              </div>
              <div class="check-panel-content">
                <div v-if="isCheckingFixed" class="check-loading">
                  <span class="check-spinner"></span>
                  检测中...
                </div>
                <template v-else-if="fixedCheckResult">
                  <div
                    class="check-summary"
                    :class="{
                      passed: fixedCheckResult.passed,
                      failed: !fixedCheckResult.passed,
                    }"
                  >
                    <span v-if="fixedCheckResult.passed">✅ 检测通过</span>
                    <span v-else>
                      ❌ 发现 {{ fixedCheckResult.summary.errors }} 个错误，
                      {{ fixedCheckResult.summary.warnings }} 个警告
                    </span>
                  </div>
                  <div
                    v-if="fixedCheckResult.issues.length > 0"
                    class="check-issues"
                  >
                    <div
                      v-for="(issue, idx) in fixedCheckResult.issues"
                      :key="idx"
                      class="check-issue"
                      :class="[
                        issue.severity,
                        { invisible: issue.isInvisible },
                      ]"
                    >
                      <div class="issue-header">
                        <span class="issue-icon">
                          {{
                            issue.isInvisible
                              ? "👻"
                              : issue.severity === "error"
                              ? "🔴"
                              : issue.severity === "warning"
                              ? "🟡"
                              : "🔵"
                          }}
                        </span>
                        <span class="issue-message">{{ issue.message }}</span>
                      </div>
                      <div class="issue-element">{{ issue.element }}</div>
                      <div v-if="issue.details" class="issue-details">
                        {{ issue.details }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="check-empty">没有发现排版问题 🎉</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 缩略图导航（单页模式下隐藏） -->
      <!-- <div class="thumbnail-nav">
        <div
          v-for="(slide, idx) in slides"
          :key="idx"
          class="thumbnail"
          :class="{ active: idx === currentIndex }"
          @click="goToSlide(idx)"
        >
          <div class="thumb-index">{{ idx + 1 }}</div>
          <div class="thumb-title">{{ slide.title || `幻灯片 ${idx + 1}` }}</div>
        </div>
      </div> -->
    </div>

    <!-- GrapesJS 可视化编辑器 -->
    <GrapesEditor
      :html="grapesEditorHtml"
      :visible="showGrapesEditor"
      @save="handleGrapesSave"
      @close="closeGrapesEditor"
    />
  </div>
</template>

<style scoped>
.result-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--main-bg);
  padding: 24px 32px;
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: fadeIn 0.5s ease;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 24px;
  opacity: 0.85;
}

.empty-state h2 {
  font-size: 1.8rem;
  color: var(--text-primary);
  margin-bottom: 12px;
  font-family: "Georgia", serif;
}

.empty-state p {
  font-size: 1rem;
  color: var(--text-secondary);
  max-width: 400px;
  margin-bottom: 40px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 400px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--panel-bg);
  padding: 14px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.f-icon {
  font-size: 1.2rem;
}

.f-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 加载状态 */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.loading-animation {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 32px;
}

.pulse-ring {
  position: absolute;
  inset: 0;
  border: 2px solid var(--accent-color);
  border-radius: 50%;
  animation: pulse-expand 2s ease-out infinite;
  opacity: 0;
}

.pulse-ring.delay-1 {
  animation-delay: 0.66s;
}
.pulse-ring.delay-2 {
  animation-delay: 1.33s;
}

@keyframes pulse-expand {
  0% {
    transform: scale(0.3);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

.center-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
  }
}

.loading-state h2 {
  font-size: 1.4rem;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.loading-state p {
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.batch-progress {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.batch-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--border-color);
  transition: all 0.3s;
}

.batch-dot.current {
  background: var(--accent-color);
  animation: pulse 1s ease-in-out infinite;
}

.batch-dot.done {
  background: #22c55e;
}

.batch-dot.error {
  background: #ef4444;
}

.loading-thumbnails {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}

.thumb-item {
  width: 48px;
  height: 32px;
  background: var(--panel-bg);
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  animation: slideUp 0.3s ease;
  box-shadow: var(--shadow-sm);
}

.thumb-number {
  font-size: 0.8rem;
  color: var(--accent-color);
  font-weight: 600;
}

/* 错误状态 */
.error-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.error-icon {
  font-size: 3.5rem;
  margin-bottom: 20px;
}

.error-state h2 {
  font-size: 1.4rem;
  color: var(--error-color);
  margin-bottom: 8px;
}

.error-state p {
  font-size: 0.95rem;
  color: var(--text-secondary);
  max-width: 400px;
  margin-bottom: 24px;
}

.retry-btn {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 24px;
  color: var(--text-primary);
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
}

.retry-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

/* 预览状态 */
.preview-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
}

/* 预览列表 */
.preview-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  min-height: 0;
}

.preview-list.has-fixed {
  gap: 32px;
}

.preview-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-label {
  font-size: 0.85rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
}

.preview-label.original {
  background: var(--card-bg);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.preview-label.fixed {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border: 1px solid rgba(34, 197, 94, 0.3);
}

/* 修复中状态 */
.fixing-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 40px;
  background: var(--card-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.fixing-animation {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fixing-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.fix-stream {
  max-width: 100%;
  max-height: 150px;
  overflow: auto;
  font-size: 0.7rem;
  color: var(--text-tertiary);
  background: var(--input-bg);
  padding: 12px;
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 预览区域 */
.preview-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  position: relative;
  margin-bottom: 16px;
}

/* 顶部工具条 */
.top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 16px;
  background: #1a1a2e;
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-center {
  display: flex;
  align-items: center;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-title {
  font-size: 13px;
  color: #888;
  font-weight: 500;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn.active {
  background: rgba(0, 235, 190, 0.25);
  color: #00ebbe;
}

.toolbar-btn.reset-btn {
  color: #ff9500;
}

.toolbar-btn.reset-btn:hover {
  background: rgba(255, 149, 0, 0.2);
  color: #ffb340;
}

/* GrapesJS 编辑器按钮 */
.toolbar-btn.grapes-btn {
  color: #a855f7;
}

.toolbar-btn.grapes-btn:hover {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.fullscreen-btn.reset-btn {
  color: #ff9500;
  border-color: rgba(255, 149, 0, 0.3);
}

.fullscreen-btn.reset-btn:hover {
  background: rgba(255, 149, 0, 0.2);
}

/* GrapesJS 编辑器按钮 */
.fullscreen-btn.grapes-btn {
  color: #a855f7;
  border-color: rgba(168, 85, 247, 0.3);
}

.fullscreen-btn.grapes-btn:hover {
  background: rgba(168, 85, 247, 0.2);
}

.btn-icon {
  font-size: 14px;
}

.btn-text {
  font-size: 12px;
  font-weight: 500;
}

/* 排版检测面板 */
.check-panel {
  position: absolute;
  right: 70px;
  top: 50%;
  transform: translateY(-50%);
  width: 360px;
  max-height: 480px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.check-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--card-bg);
}

.check-panel-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.check-panel-close {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.check-panel-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.check-panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.check-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.check-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.check-summary {
  padding: 12px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  margin-bottom: 12px;
}

.check-summary.passed {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.check-summary.failed {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.check-issues {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-issue {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
}

.check-issue.error {
  border-left: 3px solid #ef4444;
}

.check-issue.warning {
  border-left: 3px solid #f59e0b;
}

.check-issue.info {
  border-left: 3px solid #3b82f6;
}

.check-issue.active {
  background: var(--accent-bg);
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px rgba(255, 68, 68, 0.2);
}

.check-issue:hover {
  background: var(--hover-bg);
}

.check-issue.invisible {
  background: rgba(128, 128, 128, 0.15);
  border-color: #888;
}

.check-issue.invisible .issue-icon {
  opacity: 0.8;
}

.issue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.issue-icon {
  font-size: 12px;
}

.issue-message {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-primary);
}

.issue-element {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-family: "Consolas", monospace;
  margin-bottom: 2px;
}

.issue-details {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.check-empty {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

/* 代码视图 */
.code-container {
  flex: 1;
  max-width: 1280px;
  aspect-ratio: 16/9;
  background: #1e1e1e;
  overflow: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
}

.code-view {
  margin: 0;
  padding: 16px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-view code {
  font-family: inherit;
}

.nav-btn {
  width: 48px;
  height: 80px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 2rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.nav-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--accent-bg);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.slide-container {
  flex: 1;
  width: 100%;
  max-width: 1280px;
  aspect-ratio: 16/9;
  background: #fff;
  border-radius: 0;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.35), 0 4px 16px rgba(0, 0, 0, 0.25);
  align-self: center;
}

.slide-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  transform-origin: top left;
  transform: scale(calc((100cqw - 2px) / 1280));
}

.slide-container {
  container-type: inline-size;
}

/* 缩略图导航 */
.thumbnail-nav {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
}

.thumbnail {
  min-width: 100px;
  padding: 10px 14px;
  background: var(--card-bg);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.thumbnail:hover {
  border-color: var(--border-color);
  background: var(--hover-bg);
}

.thumbnail.active {
  border-color: var(--accent-color);
  background: var(--accent-bg);
}

.thumb-index {
  font-size: 0.75rem;
  color: var(--accent-color);
  font-weight: 600;
}

.thumb-title {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.thumbnail.active .thumb-title {
  color: var(--text-primary);
}

/* 批量模式样式 */
.batch-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.batch-table-wrapper {
  flex: 1;
  overflow: auto;
  background: var(--panel-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.batch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.batch-table th,
.batch-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.batch-table th {
  background: var(--card-bg);
  font-weight: 600;
  color: var(--text-primary);
  position: sticky;
  top: 0;
  z-index: 10;
}

.batch-table tr:hover {
  background: var(--hover-bg);
}

.batch-table tr.current {
  background: var(--accent-bg);
}

.col-index {
  width: 50px;
  text-align: center !important;
  color: var(--text-tertiary);
}

.col-prompt {
  min-width: 150px;
  max-width: 250px;
}

.prompt-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.col-preview {
  width: 200px;
}

.col-duration {
  width: 80px;
  text-align: center !important;
  font-family: "Consolas", monospace;
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.col-status {
  width: 100px;
}

.col-layout {
  width: 80px;
  text-align: center !important;
}

.layout-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
}

.layout-badge.ok {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.layout-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.layout-pending,
.layout-na {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

/* 差异度列 */
.col-diff {
  width: 80px;
  text-align: center !important;
}

.diff-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  font-family: "Consolas", monospace;
}

.diff-badge.low {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.diff-badge.medium {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.diff-badge.high {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.diff-error {
  color: var(--text-tertiary);
}

.diff-pending,
.diff-na {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

/* 迷你预览 */
.mini-preview {
  width: 160px;
  height: 90px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: #fff;
  transition: all 0.2s;
}

.mini-preview:hover {
  border-color: var(--accent-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.mini-preview.fixed {
  border-color: rgba(34, 197, 94, 0.4);
}

.mini-preview.fixed:hover {
  border-color: #22c55e;
}

.mini-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  transform-origin: center center;
  transform: scale(0.125);
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -360px;
  margin-left: -640px;
  pointer-events: none;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.mini-preview:hover .preview-overlay {
  background: rgba(0, 0, 0, 0.5);
}

.preview-expand {
  color: #fff;
  font-size: 0.75rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.mini-preview:hover .preview-expand {
  opacity: 1;
}

.mini-loading,
.mini-error,
.mini-pending,
.mini-ok {
  width: 160px;
  height: 90px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  background: var(--card-bg);
}

.mini-loading {
  color: var(--accent-color);
}

.mini-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.mini-error {
  color: #ef4444;
  font-size: 1.2rem;
  flex-direction: column;
  gap: 4px;
  cursor: help;
}

.error-hint {
  font-size: 0.65rem;
  color: #ef4444;
  max-width: 140px;
  text-align: center;
  word-break: break-all;
  line-height: 1.2;
}

.mini-pending {
  color: var(--text-tertiary);
}

.mini-ok {
  color: #22c55e;
  font-size: 0.75rem;
}

/* 状态徽章 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  white-space: nowrap;
}

.status-badge.pending {
  background: var(--card-bg);
  color: var(--text-tertiary);
}

.status-badge.generating {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.status-badge.fixing {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.status-badge.done {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.status-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

/* 全屏模态框 */
.fullscreen-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  animation: fadeIn 0.2s ease;
}

.fullscreen-content {
  width: 100%;
  max-width: 1400px;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fullscreen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fullscreen-title {
  color: #fff;
  font-size: 1.1rem;
  font-weight: 600;
}

.fullscreen-actions {
  display: flex;
  gap: 12px;
}

.fullscreen-btn {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.fullscreen-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.fullscreen-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fullscreen-btn.active {
  background: rgba(0, 235, 190, 0.25);
  color: #00ebbe;
  border-color: rgba(0, 235, 190, 0.4);
}

.fullscreen-close {
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: #fff;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.fullscreen-iframe-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 0;
  position: relative;
}

.fullscreen-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  background: #fff;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

/* 全屏代码视图 */
.fullscreen-code-container {
  width: 1280px;
  height: 720px;
  background: #1e1e1e;
  overflow: auto;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.fullscreen-code-view {
  margin: 0;
  padding: 16px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 全屏浮动工具条 */
/* 全屏排版检测面板 */
.fullscreen-check-panel {
  position: absolute;
  right: 100px;
  top: 50%;
  transform: translateY(-50%);
  width: 360px;
  max-height: 480px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* 编辑工具条样式 */
</style>
