<script setup lang="ts">
import { ref, reactive, defineAsyncComponent } from "vue";

// 异步组件加载
const InputPanel = defineAsyncComponent(() => import("./components/InputPanel.vue"));
const ResultPanel = defineAsyncComponent(() => import("./components/ResultPanel.vue"));
const TestTool = defineAsyncComponent(() => import("./components/TestTool.vue"));
const ImageComparePage = defineAsyncComponent(() => import("./components/ImageComparePage.vue"));
const TemplateFixPage = defineAsyncComponent(() => import("./components/TemplateFixPage.vue"));
const KdocsAIGCPanel = defineAsyncComponent(() => import("./components/KdocsAIGCPanel.vue"));
const KeepStylePanel = defineAsyncComponent(() => import("./components/KeepStylePanel.vue"));
// PresentationEditor 也可以异步加载，减少首屏包体积
const PresentationEditor = defineAsyncComponent(() => import("./components/PresentationEditor.vue"));

import {
  generateSinglePageHtmlPpt,
  fixLayoutIssues,
  type GenerateRequest,
  type SlideResult,
} from "./services/llmService";
import { checkLayoutInIframe } from "./utils/layout-checker";
import { compareHtmlImages } from "./utils/image-compare";

type Status = "idle" | "loading" | "success" | "error";

// 批量结果项
export interface BatchResultItem {
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

const status = ref<Status>("idle");
const errorMessage = ref("");
const slides = reactive<SlideResult[]>([]);
const currentSlideIndex = ref(0);
const streamContent = ref("");

// 自动修复相关
const fixedSlide = ref<SlideResult | null>(null);
const isFixing = ref(false);
const fixStreamContent = ref("");

// 批量模式相关
const loopCount = ref(1);
const batchResults = reactive<BatchResultItem[]>([]);
const currentBatchIndex = ref(0);

// 模式切换：main（主界面）、test（测试工具）、image-compare（图片对比）、template-fix（模板修复）、kdocs-aigc（金山文档AI能力）、keepstyle（样式保持生成）或 presentation-editor（演示编辑器）
const mode = ref<"main" | "test" | "image-compare" | "template-fix" | "kdocs-aigc" | "keepstyle" | "presentation-editor">("presentation-editor");

async function handleGenerate(
  request: GenerateRequest,
  autoFix: boolean,
  count: number
) {
  loopCount.value = count || 1;

  // 统一使用批量模式（表格视图）
  await handleBatchGenerate(request, autoFix, count || 1);
}

// 批量生成
async function handleBatchGenerate(
  request: GenerateRequest,
  autoFix: boolean,
  count: number
) {
  status.value = "loading";
  errorMessage.value = "";
  slides.length = 0;
  streamContent.value = "";
  fixedSlide.value = null;
  batchResults.length = 0;
  currentBatchIndex.value = 0;

  // 累计日志
  let batchLog = `[批量生成] 开始批量生成 ${count} 个结果\n${"=".repeat(50)}\n`;
  streamContent.value = batchLog;

  // 初始化批量结果
  for (let i = 0; i < count; i++) {
    batchResults.push({
      prompt: request.prompt,
      originalSlide: null,
      fixedSlide: null,
      duration: 0,
      hasLayoutFix: false,
      status: "pending",
    });
  }

  // 依次执行生成
  for (let i = 0; i < count; i++) {
    currentBatchIndex.value = i;
    batchResults[i].status = "generating";
    const startTime = Date.now();

    batchLog += `\n[#${i + 1}/${count}] 开始生成...\n`;
    streamContent.value = batchLog;

    try {
      let slide: SlideResult | null = null;
      let lastStreamContent = "";
      await generateSinglePageHtmlPpt(request, {
        onSlideGenerated(s) {
          slide = s;
        },
        onStreamContent(content) {
          lastStreamContent = content;
          // 显示累计日志 + 当前流式内容
          streamContent.value = batchLog + `[当前输出]\n${content}`;
        },
        onError(error) {
          batchResults[i].status = "error";
          batchResults[i].errorMessage = error;
          batchLog += `[#${i + 1}] ❌ 错误: ${error}\n`;
        },
        onComplete() {},
      });

      // 保存完整生成日志
      if (lastStreamContent) {
        batchLog += `[#${i + 1}] 生成完成 (${lastStreamContent.length} 字符)\n`;
        batchLog += `--- 完整输出 ---\n${lastStreamContent}\n--- 输出结束 ---\n`;
      }
      streamContent.value = batchLog;

      if (slide) {
        const currentSlide = slide as SlideResult;
        batchResults[i].originalSlide = currentSlide;
        batchResults[i].duration = Date.now() - startTime;

        // 立即检测原始结果的爆版
        batchLog += `[#${i + 1}] 检测原始结果...\n`;
        streamContent.value = batchLog;
        const originalCheck = await checkLayoutErrors(currentSlide.html);
        batchResults[i].originalLayoutErrors = originalCheck.count;
        batchResults[i].originalLayoutDetails = originalCheck.details;

        if (originalCheck.count > 0) {
          batchLog += `[#${i + 1}] 原始结果: ❌ ${
            originalCheck.count
          } 个爆版问题\n`;
        } else {
          batchLog += `[#${i + 1}] 原始结果: ✅ 无爆版\n`;
        }
        streamContent.value = batchLog;

        // 自动修复
        if (autoFix && originalCheck.count > 0) {
          batchResults[i].status = "fixing";
          batchLog += `[#${i + 1}] 正在修复...\n`;
          streamContent.value = batchLog;

          const fixResult = await doFixLayout(
            slide,
            originalCheck,
            request.model
          );

          if (fixResult.slide) {
            batchResults[i].fixedSlide = fixResult.slide;
            batchResults[i].hasLayoutFix = true;

            // 立即检测修复结果的爆版
            batchLog += `[#${i + 1}] 检测修复结果...\n`;
            streamContent.value = batchLog;
            const fixedCheck = await checkLayoutErrors(fixResult.slide.html);
            batchResults[i].fixedLayoutErrors = fixedCheck.count;
            batchResults[i].fixedLayoutDetails = fixedCheck.details;

            if (fixedCheck.count > 0) {
              batchLog += `[#${i + 1}] 修复结果: ⚠️ 仍有 ${
                fixedCheck.count
              } 个问题\n`;
            } else {
              batchLog += `[#${i + 1}] 修复结果: ✅ 已全部修复\n`;
            }

            // 图片对比：计算原始与修复结果的差异度
            batchLog += `[#${i + 1}] 对比图片差异...\n`;
            streamContent.value = batchLog;
            const compareResult = await compareHtmlImages(
              currentSlide.html,
              fixResult.slide.html
            );
            batchResults[i].imageDiff = compareResult.diffPercent;
            if (compareResult.diffPercent >= 0) {
              batchLog += `[#${
                i + 1
              }] 图片差异: ${compareResult.diffPercent.toFixed(1)}%\n`;
            } else {
              batchLog += `[#${i + 1}] 图片差异: 对比失败\n`;
            }
          } else {
            const errDetail = fixResult.error || "未知错误";
            batchResults[i].fixErrorMessage = errDetail;
            batchLog += `[#${i + 1}] ❌ 修复失败: ${errDetail}\n`;
          }
          batchResults[i].duration = Date.now() - startTime;
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        batchLog += `[#${i + 1}] ✅ 完成 (${duration}s)\n`;
        batchResults[i].status = "done";
      } else if (batchResults[i].status !== "error") {
        batchResults[i].status = "error";
        batchResults[i].errorMessage = "生成失败";
        batchLog += `[#${i + 1}] ❌ 生成失败\n`;
      }
    } catch (err) {
      batchResults[i].status = "error";
      const errMsg = err instanceof Error ? err.message : "生成失败";
      batchResults[i].errorMessage = errMsg;
      batchResults[i].duration = Date.now() - startTime;
      batchLog += `[#${i + 1}] ❌ 异常: ${errMsg}\n`;
    }

    streamContent.value = batchLog;

    // 批量生成间隔延迟（3-8秒随机），最后一个不需要延迟
    if (i < count - 1) {
      const delay = Math.floor(Math.random() * 5000) + 3000; // 3000-8000ms
      batchLog += `\n⏳ 等待 ${(delay / 1000).toFixed(1)}s 后继续...\n`;
      streamContent.value = batchLog;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  batchLog += `\n${"=".repeat(50)}\n[批量生成] 完成！共 ${count} 个结果\n`;
  streamContent.value = batchLog;
  status.value = "success";
}

// 检测布局错误
interface LayoutIssueInfo {
  type: string;
  severity: string;
  element: string;
  message: string;
  details?: string;
}

interface LayoutCheckInfo {
  count: number;
  details: string[];
  issues: LayoutIssueInfo[];
}

async function checkLayoutErrors(html: string): Promise<LayoutCheckInfo> {
  const tempIframe = document.createElement("iframe");
  tempIframe.style.cssText =
    "position:absolute;left:-9999px;width:1280px;height:720px;border:none;";
  tempIframe.sandbox.add("allow-same-origin", "allow-scripts");
  document.body.appendChild(tempIframe);

  try {
    const doc = tempIframe.contentDocument;
    if (!doc) return { count: 0, details: [], issues: [] };
    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const checkResult = checkLayoutInIframe(tempIframe);
    const errorIssues = checkResult.issues.filter(
      (i) => i.severity === "error"
    );
    return {
      count: errorIssues.length,
      details: errorIssues.map((i) => `${i.element}: ${i.message}`),
      issues: errorIssues.map((i) => ({
        type: i.type,
        severity: i.severity,
        element: i.element,
        message: i.message,
        details: i.details,
      })),
    };
  } finally {
    document.body.removeChild(tempIframe);
  }
}

// 执行修复（不含检测，检测已在外部完成）
interface FixResult {
  slide: SlideResult | null;
  error?: string;
}

async function doFixLayout(
  slide: SlideResult,
  checkInfo: LayoutCheckInfo,
  model?: string
): Promise<FixResult> {
  let fixError: string | undefined;

  const result = await fixLayoutIssues(
    {
      html: slide.html,
      issues: checkInfo.issues,
      model,
    },
    {
      onStreamContent() {},
      onError(error) {
        fixError = error;
        console.error("修复失败:", error);
      },
      onComplete() {},
    }
  );

  return { slide: result, error: fixError };
}

function handleExport() {
  if (slides.length === 0) return;

  // 单页模式：直接导出该页的完整 HTML
  const currentSlide = slides[currentSlideIndex.value];
  if (currentSlide) {
    downloadFile(currentSlide.html, "slide-export.html", "text/html");
  }
}

function handleExportFixed() {
  if (!fixedSlide.value) return;
  downloadFile(fixedSlide.value.html, "slide-fixed.html", "text/html");
}

function handleExportBatchItem(index: number, type: "original" | "fixed") {
  const item = batchResults[index];
  if (!item) return;

  const slide = type === "original" ? item.originalSlide : item.fixedSlide;
  if (!slide) return;

  const filename =
    type === "original"
      ? `slide-${index + 1}.html`
      : `slide-${index + 1}-fixed.html`;
  downloadFile(slide.html, filename, "text/html");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app-container">
    <!-- 模式切换按钮 -->
    <div class="mode-switcher">
      <button
        class="mode-btn"
        :class="{ active: mode === 'presentation-editor' }"
        @click="mode = 'presentation-editor'"
      >
        🖥️ 演示编辑器
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'main' }"
        @click="mode = 'main'"
      >
        🎨 主界面
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'test' }"
        @click="mode = 'test'"
      >
        🧪 测试工具
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'image-compare' }"
        @click="mode = 'image-compare'"
      >
        🔍 图片对比
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'template-fix' }"
        @click="mode = 'template-fix'"
      >
        🔧 模板修复
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'kdocs-aigc' }"
        @click="mode = 'kdocs-aigc'"
      >
        🚀 金山文档AI
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'keepstyle' }"
        @click="mode = 'keepstyle'"
      >
        🎨 样式保持
      </button>
    </div>

    <!-- 主界面 -->
    <template v-if="mode === 'main'">
      <aside class="sidebar">
        <InputPanel
          :loading="status === 'loading' || isFixing"
          :stream-content="streamContent"
          @generate="handleGenerate"
        />
      </aside>
      <main class="main-content">
        <ResultPanel
          :status="status"
          :slides="slides"
          :current-index="currentSlideIndex"
          :error-message="errorMessage"
          :fixed-slide="fixedSlide"
          :is-fixing="isFixing"
          :fix-stream-content="fixStreamContent"
          :loop-count="loopCount"
          :batch-results="batchResults"
          :current-batch-index="currentBatchIndex"
          @update:current-index="currentSlideIndex = $event"
          @export="handleExport"
          @export-fixed="handleExportFixed"
          @export-batch-item="handleExportBatchItem"
        />
      </main>
    </template>

    <!-- 测试工具 -->
    <template v-else-if="mode === 'test'">
      <TestTool />
    </template>

    <!-- 图片对比 -->
    <template v-else-if="mode === 'image-compare'">
      <ImageComparePage />
    </template>

    <!-- 模板修复 -->
    <template v-else-if="mode === 'template-fix'">
      <TemplateFixPage />
    </template>

    <!-- 金山文档AI能力 -->
    <template v-else-if="mode === 'kdocs-aigc'">
      <KdocsAIGCPanel />
    </template>

    <!-- 样式保持生成 -->
    <template v-else-if="mode === 'keepstyle'">
      <KeepStylePanel />
    </template>

    <!-- 演示编辑器 -->
    <template v-else-if="mode === 'presentation-editor'">
      <PresentationEditor />
    </template>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--main-bg);
}

.sidebar {
  width: 420px;
  min-width: 380px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}

.main-content {
  flex: 1;
  min-width: 1400px;
  overflow: hidden;
}

.mode-switcher {
  position: fixed;
  top: 16px;
  right: 0;
  display: flex;
  gap: 8px;
  z-index: 1000;
  background: var(--panel-bg);
  padding: 8px;
  padding-left: 28px;
  border-radius: 8px 0 0 8px;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-color);
  border-right: none;
  transform: translateX(calc(100% - 24px));
  opacity: 0.6;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.mode-switcher:hover {
  transform: translateX(0);
  opacity: 1;
}

.mode-switcher::after {
  content: "◀";
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--text-secondary);
  pointer-events: none;
  transition: opacity 0.2s;
}

.mode-switcher:hover::after {
  opacity: 0;
}

.mode-btn {
  padding: 8px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.mode-btn.active {
  background: var(--accent-gradient);
  color: #fff;
  border-color: transparent;
}
</style>
