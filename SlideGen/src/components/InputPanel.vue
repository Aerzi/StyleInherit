<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import {
  getAllTemplates,
  getTemplateById,
  loadHtmlTemplateContent,
  loadPicTemplateBase64,
  loadPptxTemplateAsHtml,
  type BuiltInTemplate,
} from "../templates";
import {
  fetchModels,
  recognizeTemplateIntent,
  type GenerateRequest,
  type ModelInfo,
} from "../services/llmService";
import { useStorageRef } from "../utils/local-storages";
import {
  loadAndAnalyzeTemplates,
  generateTemplateIndex,
} from "../utils/template-analyzer";
import { autoDownloadPrompts } from "../utils/prompt-exporter";
import {
  parseContextFile,
  parsePptxSlides,
  type ParsedContext,
  type PptxSlide,
} from "../utils/context-parser";

const emit = defineEmits<{
  generate: [request: GenerateRequest, autoFix: boolean, loopCount: number];
}>();

const props = defineProps<{
  loading: boolean;
  streamContent: string;
}>();

// 流式日志自动滚动
const streamTextareaRef = ref<HTMLTextAreaElement | null>(null);

watch(
  () => props.streamContent,
  () => {
    nextTick(() => {
      if (streamTextareaRef.value) {
        streamTextareaRef.value.scrollTop =
          streamTextareaRef.value.scrollHeight;
      }
    });
  }
);

// 内置模板列表
const templates = ref<BuiltInTemplate[]>([]);

// HTML 模板内容缓存（用于缩略图预览）
const htmlTemplateContents = ref<Record<string, string>>({});

// 按类型分组的模板
const htmlTemplates = computed(() =>
  templates.value.filter((t) => t.type === "html")
);
const picTemplates = computed(() =>
  templates.value.filter((t) => t.type === "pic")
);
const pptxTemplates = computed(() =>
  templates.value.filter((t) => t.type === "pptx")
);

// 预览相关
const hoverTemplate = ref<BuiltInTemplate | null>(null);
const previewContent = ref<string | null>(null);
const isLoadingPreview = ref(false);

// hover 预览
async function handleTemplateHover(template: BuiltInTemplate | null) {
  hoverTemplate.value = template;
  if (!template) {
    previewContent.value = null;
    return;
  }

  isLoadingPreview.value = true;
  try {
    if (template.type === "html") {
      previewContent.value = await loadHtmlTemplateContent(template);
    } else if (template.type === "pic") {
      previewContent.value = await loadPicTemplateBase64(template);
    } else if (template.type === "pptx") {
      // pptx 暂时显示占位
      previewContent.value = null;
    }
  } catch {
    previewContent.value = null;
  } finally {
    isLoadingPreview.value = false;
  }
}

// 选择模板
function selectTemplate(template: BuiltInTemplate) {
  if (selectedTemplateId.value === template.id) {
    selectedTemplateId.value = "";
  } else {
    selectedTemplateId.value = template.id;
  }
}

// 加载模板列表
onMounted(async () => {
  // 监听全局粘贴事件
  document.addEventListener("paste", handlePaste);

  templates.value = await getAllTemplates();

  // 预加载 HTML 模板内容用于缩略图
  const htmlTpls = templates.value.filter((t) => t.type === "html");
  for (const tpl of htmlTpls) {
    try {
      const content = await loadHtmlTemplateContent(tpl);
      htmlTemplateContents.value[tpl.id] = content;
    } catch {
      // 忽略加载失败的模板
    }
  }

  // 加载模型列表
  isLoadingModels.value = true;
  try {
    modelList.value = await fetchModels();
  } finally {
    isLoadingModels.value = false;
  }
});

// 表单状态（持久化）
const prompt = useStorageRef("htmlppt-prompt", "");
const slideCount = ref(1); // 默认单页
const selectedTemplateId = useStorageRef("htmlppt-template", "");
const autoFixLayout = useStorageRef("htmlppt-autofix", true); // 自动修复爆板，默认开启
const loopCount = useStorageRef("htmlppt-loopcount", 1); // 循环生成次数，默认1次
const enableIntentRecognition = useStorageRef(
  "htmlppt-intent-recognition",
  false
); // 意图识别，默认关闭
const savePrompts = useStorageRef("htmlppt-save-prompts", true); // 保存提示词，默认开启
const isRecognizing = ref(false); // 意图识别进行中

// 模型选择
const modelList = ref<ModelInfo[]>([]);
const selectedModel = useStorageRef("htmlppt-model", "glm-4.6");
const maxTokens = useStorageRef("htmlppt-maxtokens", 16000);
const isLoadingModels = ref(false);

// 检测是否为多模态模型
function isMultimodalModel(modelName: string): boolean {
  const multimodalPrefixes = [
    "claude-",
    "gpt-4-vision-",
    "gpt-4-version-turbo-2024-04-09",
    "gpt-4o",
    "gemini-",
    "qwen-vl-",
    "step-",
    "doubao-",
    "Doubao-"
  ];
  return multimodalPrefixes.some((prefix) => modelName.startsWith(prefix));
}

// 自定义参考
interface CustomReference {
  type: "html" | "pptx" | "image" | "url";
  content: string;
  filename?: string;
  preview?: string;
}
const customReference = ref<CustomReference | null>(null);
const urlInput = ref("");
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const showRefPreview = ref(false);

// 上下文文件
const contextFile = ref<ParsedContext | null>(null);
const contextFileInputRef = ref<HTMLInputElement | null>(null);
const isParsingContext = ref(false);

// pptx 页面选择弹窗
const showPptxSlideSelector = ref(false);
const pptxSlides = ref<PptxSlide[]>([]);
const pendingPptxFile = ref<File | null>(null);

// 上下文文件内容预览（最多300字符）
const contextPreviewTip = computed(() => {
  if (!contextFile.value?.content) return "";
  const content = contextFile.value.content.trim();
  if (content.length <= 300) return content;
  return content.slice(0, 300) + "...";
});

// 计算是否有自定义参考（有自定义参考时忽略内置模板）
const hasCustomReference = computed(() => customReference.value !== null);

// 计算是否应该禁用意图识别复选框
const isIntentRecognitionDisabled = computed(() => {
  return (
    props.loading ||
    isRecognizing.value ||
    hasCustomReference.value ||
    !!selectedTemplateId.value
  );
});

// 计算是否应该禁用所有控件（生成中或意图识别中）
const isProcessing = computed(() => {
  return props.loading || isRecognizing.value;
});

// 当用户选择模板或上传自定义参考时，自动取消勾选意图识别
watch(
  () => [hasCustomReference.value, selectedTemplateId.value],
  ([hasRef, templateId]) => {
    if ((hasRef || templateId) && enableIntentRecognition.value) {
      enableIntentRecognition.value = false;
    }
  }
);

// 根据是否有图片参考过滤模型列表
const filteredModelList = computed(() => {
  const hasImageRef = customReference.value?.type === "image";
  if (hasImageRef) {
    return modelList.value.filter((m: ModelInfo) => isMultimodalModel(m.id));
  }
  return modelList.value;
});

// 监听参考类型变化，图片参考时自动切换到多模态模型
watch(
  () => customReference.value?.type,
  (newType) => {
    if (newType === "image") {
      selectedModel.value = "gemini-3-pro-preview";
    }
  }
);

// 模型对应的 max_tokens 预设
const modelMaxTokensPreset: Record<string, number> = {
  "glm-4.6": 131072,
  "gemini-3-pro-preview": 65536,
};

// 监听模型变化，自动设置对应的 max_tokens（immediate: true 确保初始化时也执行）
watch(
  () => selectedModel.value,
  (newModel) => {
    if (newModel && modelMaxTokensPreset[newModel]) {
      maxTokens.value = modelMaxTokensPreset[newModel];
    } else {
      maxTokens.value = 65536;
    }
  },
  { immediate: true }
);

// 文件上传处理
function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  processFile(file);
  if (fileInputRef.value) fileInputRef.value.value = "";
}

function processFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "html" || ext === "htm") {
    const reader = new FileReader();
    reader.onload = (e) => {
      customReference.value = {
        type: "html",
        content: e.target?.result as string,
        filename: file.name,
      };
    };
    reader.readAsText(file);
  } else if (ext === "pptx" || ext === "ppt") {
    const reader = new FileReader();
    reader.onload = (e) => {
      customReference.value = {
        type: "pptx",
        content: e.target?.result as string,
        filename: file.name,
      };
    };
    reader.readAsDataURL(file);
  } else if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      customReference.value = {
        type: "image",
        content: e.target?.result as string,
        filename: file.name,
        preview: e.target?.result as string,
      };
    };
    reader.readAsDataURL(file);
  } else {
    alert("不支持的文件类型。支持：.html, .pptx, 图片");
  }
}

// 拖拽处理
function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
}

// 粘贴处理（支持图片和 HTML）
function handlePaste(e: ClipboardEvent) {
  if (props.loading) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  // 优先检查图片
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        processFile(file);
        return;
      }
    }
  }

  // 检查 HTML 文本
  for (const item of items) {
    if (item.type === "text/html") {
      item.getAsString((html) => {
        // 检查是否是完整的 HTML 文档
        if (html.includes("<!DOCTYPE") || html.includes("<html")) {
          customReference.value = {
            type: "html",
            content: html,
            filename: "粘贴的 HTML",
          };
        }
      });
      // 不阻止默认行为，允许继续粘贴到 textarea
      return;
    }
  }
}

onUnmounted(() => {
  document.removeEventListener("paste", handlePaste);
});

// URL 添加
function addUrlReference() {
  const url = urlInput.value.trim();
  if (!url) return;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    alert("请输入有效的网址");
    return;
  }

  customReference.value = {
    type: "url",
    content: url,
  };
  urlInput.value = "";
}

// 清除自定义参考
function clearCustomReference() {
  customReference.value = null;
}

// 触发文件选择
function triggerFileSelect() {
  fileInputRef.value?.click();
}

// 上下文文件处理
function triggerContextFileSelect() {
  contextFileInputRef.value?.click();
}

async function handleContextFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const ext = file.name.split(".").pop()?.toLowerCase();

  // pptx 文件：先解析页面，弹出选择框
  if (ext === "pptx" || ext === "ppt") {
    isParsingContext.value = true;
    try {
      pptxSlides.value = await parsePptxSlides(file);
      if (pptxSlides.value.length === 0) {
        alert("pptx 文件中没有找到内容");
        return;
      }
      pendingPptxFile.value = file;
      showPptxSlideSelector.value = true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "文件解析失败");
    } finally {
      isParsingContext.value = false;
      if (contextFileInputRef.value) contextFileInputRef.value.value = "";
    }
    return;
  }

  // 其他文件：直接解析
  isParsingContext.value = true;
  try {
    contextFile.value = await parseContextFile(file);
  } catch (error) {
    alert(error instanceof Error ? error.message : "文件解析失败");
    contextFile.value = null;
  } finally {
    isParsingContext.value = false;
    if (contextFileInputRef.value) contextFileInputRef.value.value = "";
  }
}

// 选择 pptx 页面
function selectPptxSlide(slide: PptxSlide) {
  if (!pendingPptxFile.value) return;
  contextFile.value = {
    content: slide.content,
    filename: `${pendingPptxFile.value.name} (第${slide.pageNum}页)`,
    type: "pptx",
  };
  // 只关闭弹窗，不清空数据，以便重选
  showPptxSlideSelector.value = false;
}

// 重选 pptx 页面
function reselectPptxSlide() {
  if (pptxSlides.value.length > 0) {
    showPptxSlideSelector.value = true;
  }
}

function closePptxSlideSelector() {
  showPptxSlideSelector.value = false;
}

function clearContextFile() {
  contextFile.value = null;
  // 清空 pptx 相关数据
  pptxSlides.value = [];
  pendingPptxFile.value = null;
}

// 提交生成
async function handleGenerate() {
  if (!prompt.value.trim()) return;

  const request: GenerateRequest = {
    prompt: prompt.value.trim(),
    slideCount: slideCount.value,
    model: selectedModel.value || undefined,
    maxTokens: maxTokens.value || 16000,
    contextContent: contextFile.value?.content || undefined,
  };

  // 自定义参考优先于内置模板
  if (customReference.value) {
    request.referenceType = "custom";
    request.customReference = customReference.value;
  } else if (selectedTemplateId.value) {
    // 加载内置模板内容
    const template = await getTemplateById(selectedTemplateId.value);
    if (template) {
      try {
        if (template.type === "html") {
          const content = await loadHtmlTemplateContent(template);
          request.referenceType = "custom";
          request.customReference = {
            type: "html",
            content,
            filename: template.name,
          };
        } else if (template.type === "pic") {
          const content = await loadPicTemplateBase64(template);
          request.referenceType = "custom";
          request.customReference = {
            type: "image",
            content,
            filename: template.name,
          };
        } else if (template.type === "pptx") {
          const content = await loadPptxTemplateAsHtml(template);
          request.referenceType = "custom";
          request.customReference = {
            type: "html",
            content,
            filename: template.name,
          };
        }
      } catch (error) {
        console.warn("Failed to load template:", error);
        request.referenceType = "none";
      }
    } else {
      request.referenceType = "none";
    }
  } else if (enableIntentRecognition.value) {
    // 启用意图识别：自动选择最匹配的模板
    isRecognizing.value = true;
    try {
      // 加载并分析所有模板
      const templateInfos = await loadAndAnalyzeTemplates();
      if (templateInfos.length === 0) {
        console.warn("没有可用的模板进行意图识别");
        request.referenceType = "none";
      } else {
        // 生成模板索引
        const templateIndex = generateTemplateIndex(templateInfos);

        // 调用意图识别
        const recognizedTemplateId = await recognizeTemplateIntent(
          {
            userPrompt: prompt.value.trim(),
            templateIndex,
            model: selectedModel.value || undefined,
          },
          {
            onStreamContent(content) {
              // 可以在这里显示意图识别的过程
              console.log("[意图识别]", content);
            },
            onError(error) {
              console.error("[意图识别错误]", error);
            },
            onComplete() {
              console.log("[意图识别完成]");
            },
          }
        );

        if (recognizedTemplateId) {
          // 找到匹配的模板
          const matchedTemplate = templateInfos.find(
            (t) => t.id === recognizedTemplateId
          );
          if (matchedTemplate) {
            request.referenceType = "custom";
            request.customReference = {
              type: "html",
              content: matchedTemplate.content,
              filename: matchedTemplate.name,
            };
            console.log(
              `[意图识别] 已选择模板: ${matchedTemplate.name} (${matchedTemplate.label})`
            );
          } else {
            // 如果找不到匹配的模板，尝试通过ID查找
            const template = await getTemplateById(recognizedTemplateId);
            if (template && template.type === "html") {
              const content = await loadHtmlTemplateContent(template);
              request.referenceType = "custom";
              request.customReference = {
                type: "html",
                content,
                filename: template.name,
              };
              console.log(`[意图识别] 已选择模板: ${template.name}`);
            } else {
              console.warn(`[意图识别] 无法加载模板: ${recognizedTemplateId}`);
              request.referenceType = "none";
            }
          }
        } else {
          console.warn("[意图识别] 未能识别出合适的模板");
          request.referenceType = "none";
        }
      }
    } catch (error) {
      console.error("[意图识别] 发生错误:", error);
      request.referenceType = "none";
    } finally {
      isRecognizing.value = false;
    }
  } else {
    request.referenceType = "none";
  }

  // 记录是否使用了意图识别
  const usedIntentRecognition =
    enableIntentRecognition.value &&
    !customReference.value &&
    !selectedTemplateId.value;

  // 根据用户选择决定是否保存提示词
  if (savePrompts.value) {
    try {
      await autoDownloadPrompts(
        request,
        prompt.value.trim(),
        usedIntentRecognition
      );
    } catch (error) {
      console.warn("自动下载提示词失败:", error);
    }
  }

  emit("generate", request, autoFixLayout.value, loopCount.value);
}

// 获取参考类型图标
function getReferenceIcon(type: string): string {
  switch (type) {
    case "html":
      return "📄";
    case "pptx":
      return "📊";
    case "image":
      return "🖼️";
    case "url":
      return "🔗";
    default:
      return "📎";
  }
}
</script>

<template>
  <div class="input-panel">
    <div class="panel-header">
      <h1>HTML PPT Generator</h1>
    </div>

    <!-- 内置模板选择 -->
    <div class="form-section" :class="{ disabled: hasCustomReference }">
      <!-- HTML 模板 -->
      <div v-if="htmlTemplates.length > 0" class="template-group">
        <div class="template-group-label">HTML模板(可选)</div>
        <div class="template-grid">
          <div
            v-for="tpl in htmlTemplates"
            :key="tpl.id"
            class="template-item"
            :class="{
              selected: selectedTemplateId === tpl.id,
              disabled: loading || hasCustomReference,
            }"
            @click="!loading && !hasCustomReference && selectTemplate(tpl)"
            @mouseenter="handleTemplateHover(tpl)"
            @mouseleave="handleTemplateHover(null)"
          >
            <div class="template-thumb html-thumb">
              <iframe
                v-if="htmlTemplateContents[tpl.id]"
                :srcdoc="htmlTemplateContents[tpl.id]"
                class="thumb-iframe"
                sandbox="allow-same-origin allow-scripts"
              ></iframe>
              <i v-else class="thumb-icon">📄</i>
            </div>
            <div class="template-name">
              {{ tpl.name.replace("html - ", "") }}
            </div>
          </div>
        </div>
      </div>

      <!-- 图片模板 -->
      <div v-if="picTemplates.length > 0" class="template-group">
        <div class="template-group-label">图片</div>
        <div class="template-grid">
          <div
            v-for="tpl in picTemplates"
            :key="tpl.id"
            class="template-item"
            :class="{
              selected: selectedTemplateId === tpl.id,
              disabled: loading || hasCustomReference,
            }"
            @click="!loading && !hasCustomReference && selectTemplate(tpl)"
            @mouseenter="handleTemplateHover(tpl)"
            @mouseleave="handleTemplateHover(null)"
          >
            <div class="template-thumb">
              <img :src="tpl.path" :alt="tpl.name" />
            </div>
            <div class="template-name">
              {{ tpl.name.replace("pic - ", "") }}
            </div>
          </div>
        </div>
      </div>

      <!-- PPTX 模板 -->
      <div v-if="pptxTemplates.length > 0" class="template-group">
        <div class="template-group-label">PPTX</div>
        <div class="template-grid">
          <div
            v-for="tpl in pptxTemplates"
            :key="tpl.id"
            class="template-item"
            :class="{
              selected: selectedTemplateId === tpl.id,
              disabled: loading || hasCustomReference,
            }"
            @click="!loading && !hasCustomReference && selectTemplate(tpl)"
            @mouseenter="handleTemplateHover(tpl)"
            @mouseleave="handleTemplateHover(null)"
          >
            <div class="template-thumb">
              <i class="thumb-icon">📊</i>
            </div>
            <div class="template-name">
              {{ tpl.name.replace("pptx - ", "") }}
            </div>
          </div>
        </div>
      </div>

      <!-- 无模板提示 -->
      <div v-if="templates.length === 0" class="no-templates">暂无内置模板</div>

      <!-- Hover 预览浮层 -->
      <div
        v-if="hoverTemplate && !hasCustomReference"
        class="template-preview-float"
      >
        <div v-if="isLoadingPreview" class="preview-loading">加载中...</div>
        <template v-else-if="previewContent">
          <iframe
            v-if="hoverTemplate.type === 'html'"
            :srcdoc="previewContent"
            class="preview-iframe"
          ></iframe>
          <img
            v-else-if="hoverTemplate.type === 'pic'"
            :src="previewContent"
            class="preview-image"
          />
        </template>
        <div v-else class="preview-placeholder">
          <span v-if="hoverTemplate.type === 'pptx'">PPTX 预览暂不可用</span>
          <span v-else>无法加载预览</span>
        </div>
      </div>
    </div>

    <!-- 自定义参考上传 -->
    <div
      class="form-section reference-section"
      :class="{ dragging: isDragging }"
      @dragenter="handleDragEnter"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div class="reference-header">
        <label>
          样式参考文件
          <span class="hint">（上传后将忽略内置模板）</span>
        </label>

        <input
          ref="fileInputRef"
          type="file"
          accept=".html,.htm,.pptx,.ppt,image/*"
          @change="handleFileSelect"
          style="display: none"
        />

        <!-- 上传区域 -->
        <div v-if="!customReference" class="upload-area">
          <button
            class="upload-btn"
            @click="triggerFileSelect"
            :disabled="isProcessing"
          >
            <span class="upload-icon">📁</span>
            <span>上传或拖拽</span>
          </button>
        </div>

        <!-- 已选择的参考 -->
        <div
          v-else
          class="reference-preview"
          @mouseenter="showRefPreview = true"
          @mouseleave="showRefPreview = false"
        >
          <div class="ref-info">
            <span class="ref-icon">{{
              getReferenceIcon(customReference.type)
            }}</span>
            <div class="ref-details">
              <span class="ref-type">{{
                customReference.type.toUpperCase()
              }}</span>
              <span class="ref-name">
                {{ customReference.filename || customReference.content }}
              </span>
            </div>
          </div>
          <button
            class="clear-btn"
            @click="clearCustomReference"
            :disabled="isProcessing"
          >
            ✕
          </button>

          <!-- 悬浮预览面板 -->
          <div v-if="showRefPreview" class="ref-preview-float">
            <!-- 图片预览 -->
            <img
              v-if="customReference.type === 'image'"
              :src="customReference.preview || customReference.content"
              alt="参考图片预览"
            />
            <!-- HTML 预览 -->
            <iframe
              v-else-if="customReference.type === 'html'"
              :srcdoc="customReference.content"
              sandbox="allow-same-origin allow-scripts"
              class="ref-preview-iframe"
            ></iframe>
            <!-- 其他类型显示文本 -->
            <div v-else class="ref-preview-text">
              <p>{{ customReference.type.toUpperCase() }} 文件</p>
              <p class="ref-preview-name">{{ customReference.filename }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 拖拽遮罩 -->
      <div v-if="isDragging" class="drag-overlay">
        <span>📥 释放以上传</span>
      </div>
    </div>

    <!-- 模型选择 -->
    <div class="form-section model-section">
      <label for="model">模型</label>
      <select
        id="model"
        v-model="selectedModel"
        :disabled="isProcessing || isLoadingModels"
        class="model-select"
      >
        <option v-if="isLoadingModels" value="">加载中...</option>
        <option
          v-else-if="filteredModelList.length === 0"
          :value="selectedModel"
        >
          {{ selectedModel || "默认模型" }}
        </option>
        <option
          v-for="model in filteredModelList"
          :key="model.id"
          :value="model.id"
        >
          {{ model.id }}
        </option>
      </select>
      <input
        type="number"
        v-model.number="maxTokens"
        :disabled="isProcessing"
        class="max-tokens-input"
        placeholder="max_tokens"
        title="最大输出 token 数"
        min="1000"
        max="65536"
        step="1000"
      />
    </div>

    <!-- Prompt 输入 -->
    <div class="form-section">
      <div class="prompt-header">
        <div class="prompt-label-group">
          <label for="prompt">主题描述</label>
          <span class="prompt-hint">支持上传单页让AI美化</span>
        </div>
        <div class="context-upload-wrapper">
          <input
            ref="contextFileInputRef"
            type="file"
            accept=".txt,.docx,.pptx"
            @change="handleContextFileSelect"
            style="display: none"
          />
          <button
            v-if="!contextFile"
            class="context-upload-btn"
            @click="triggerContextFileSelect"
            :disabled="isProcessing || isParsingContext"
            title="添加上下文文件（支持 .txt, .docx, .pptx）"
          >
            <span v-if="isParsingContext">解析中...</span>
            <span v-else>📎 添加上下文</span>
          </button>
          <div v-else class="context-file-tag" :title="contextPreviewTip">
            <span class="context-icon">📄</span>
            <span class="context-name">{{ contextFile.filename }}</span>
            <button
              v-if="contextFile.type === 'pptx' && pptxSlides.length > 0"
              class="context-reselect-btn"
              @click="reselectPptxSlide"
              :disabled="isProcessing"
              title="重选页面"
            >
              ↻
            </button>
            <button
              class="context-clear-btn"
              @click="clearContextFile"
              :disabled="isProcessing"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
      <textarea
        id="prompt"
        v-model="prompt"
        placeholder="描述你想要生成的PPT主题...&#10;例如：2024年度工作总结报告"
        rows="4"
        :disabled="isProcessing"
      ></textarea>
    </div>

    <!-- 选项区域 -->
    <div class="options-section">
      <div class="options-row">
        <label class="auto-fix-checkbox">
          <input
            type="checkbox"
            v-model="autoFixLayout"
            :disabled="isProcessing"
          />
          <span>自动修复</span>
        </label>
        <label class="auto-fix-checkbox">
          <input
            type="checkbox"
            v-model="savePrompts"
            :disabled="isProcessing"
          />
          <span>保存提示词</span>
        </label>
      </div>
      <div class="options-row">
        <label
          class="auto-fix-checkbox"
          :title="
            isIntentRecognitionDisabled
              ? '请先取消选择模板或清除自定义参考'
              : ''
          "
        >
          <input
            type="checkbox"
            v-model="enableIntentRecognition"
            :disabled="isIntentRecognitionDisabled"
          />
          <span>意图识别</span>
        </label>
      </div>
    </div>

    <!-- 生成按钮行 -->
    <div class="generate-row">
      <button
        class="generate-btn"
        @click="handleGenerate"
        :disabled="isProcessing || !prompt.trim()"
      >
        <span v-if="isProcessing" class="loading-spinner"></span>
        <span v-else>✨ 生成 PPT</span>
      </button>

      <div class="loop-count-wrapper">
        <span class="loop-label">×</span>
        <input
          type="number"
          v-model.number="loopCount"
          :disabled="isProcessing"
          class="loop-count-input"
          min="1"
          max="10"
          title="循环生成次数"
        />
      </div>
    </div>

    <!-- 流式输出展示 -->
    <div class="stream-output">
      <label>生成日志</label>
      <textarea
        ref="streamTextareaRef"
        class="stream-textarea"
        :value="streamContent"
        readonly
        placeholder="生成过程将在此显示..."
      ></textarea>
    </div>

    <!-- PPTX 页面选择弹窗 -->
    <div
      v-if="showPptxSlideSelector"
      class="pptx-selector-overlay"
      @click.self="closePptxSlideSelector"
    >
      <div class="pptx-selector-modal">
        <div class="pptx-selector-header">
          <h3>选择一页作为上下文</h3>
          <button class="pptx-selector-close" @click="closePptxSlideSelector">
            ✕
          </button>
        </div>
        <div class="pptx-selector-content">
          <div
            v-for="slide in pptxSlides"
            :key="slide.pageNum"
            class="pptx-slide-item"
            @click="selectPptxSlide(slide)"
          >
            <div class="pptx-slide-header">
              <span class="pptx-slide-num">第 {{ slide.pageNum }} 页</span>
            </div>
            <div
              class="pptx-slide-preview"
              :title="slide.content || '(空白页)'"
            >
              {{ slide.content || "(空白页)" }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
  background: var(--panel-bg);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.panel-header h1 {
  font-size: 1.6rem;
  font-weight: 600;
  color: var(--accent-color);
  margin-bottom: 0;
  font-family: "Georgia", serif;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
}

.form-section.disabled {
  opacity: 0.5;
}

.form-section label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 模型选择 */
.model-section {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.model-select {
  flex: 1;
  min-width: 0;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.2s;
}

.model-select:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.model-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.max-tokens-input {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.8rem;
  text-align: center;
}

.max-tokens-input:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.max-tokens-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.max-tokens-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* 主题描述区域 */
.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.prompt-label-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prompt-hint {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  font-weight: 400;
  opacity: 0.8;
}

.context-upload-wrapper {
  display: flex;
  align-items: center;
}

.context-upload-btn {
  background: var(--card-bg);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.context-upload-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--accent-bg);
}

.context-upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.context-file-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-bg);
  border: 1px solid var(--accent-color);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
}

.context-icon {
  font-size: 0.85rem;
}

.context-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.context-reselect-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 0.9rem;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.context-reselect-btn:hover:not(:disabled) {
  color: var(--accent-color);
}

.context-clear-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 0.8rem;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.context-clear-btn:hover:not(:disabled) {
  color: var(--error-color);
}

textarea {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px;
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.5;
  resize: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

#prompt {
  max-height: 80px;
  min-height: 60px;
}

textarea:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(184, 115, 51, 0.12);
}

textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.slide-count-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

input[type="range"] {
  flex: 1;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  appearance: none;
  cursor: pointer;
}

input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 18px;
  height: 18px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
  box-shadow: var(--shadow-sm);
}

input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.count-badge {
  background: var(--accent-bg);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 0.85rem;
  color: var(--accent-color);
  font-weight: 600;
  min-width: 60px;
  text-align: center;
}

/* 模板网格 */
.template-group {
  margin-bottom: 12px;
}

.template-group-label {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.template-item {
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.template-item:hover:not(.disabled) {
  border-color: var(--accent-color);
  background: var(--accent-bg);
}

.template-item.selected {
  border-color: var(--accent-color);
  background: var(--accent-bg);
  box-shadow: 0 0 0 2px rgba(184, 115, 51, 0.2);
}

.template-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.template-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  background: var(--input-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.template-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-icon {
  font-size: 1.5rem;
  font-style: normal;
}

/* HTML 模板 iframe 缩略图 */
.html-thumb {
  pointer-events: none;
}

.thumb-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  transform-origin: center center;
  transform: scale(0.08);
  position: absolute;
  top: 50%;
  left: 50%;
  margin-top: -360px;
  margin-left: -640px;
}

.template-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 6px;
  font-size: 0.65rem;
  color: #fff;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: rgba(0, 0, 0, 0.55);
}

.template-item.selected .template-name {
  background: rgba(184, 115, 51, 0.8);
  font-weight: 500;
}

.no-templates {
  text-align: center;
  color: var(--text-tertiary);
  font-size: 0.85rem;
  padding: 20px;
  background: var(--card-bg);
  border-radius: 8px;
}

/* 模板预览浮层 */
.template-preview-float {
  position: fixed;
  left: 420px;
  top: 50%;
  transform: translateY(-50%);
  width: 640px;
  height: 360px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 0;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 9999;
}

.preview-loading,
.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  font-size: 0.9rem;
}

.preview-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  transform: scale(0.5);
  transform-origin: top left;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--card-bg);
}

/* 参考文件区域 */
.reference-section {
  position: relative;
  border-radius: 12px;
  transition: all 0.2s;
}

.reference-section.dragging {
  background: var(--accent-bg);
  outline: 2px dashed var(--accent-color);
  outline-offset: -2px;
}

.reference-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drag-overlay {
  position: absolute;
  inset: 0;
  background: rgba(184, 115, 51, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  color: var(--accent-color);
  font-weight: 500;
  z-index: 10;
  pointer-events: none;
}

.reference-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--card-bg);
  border: 1px solid var(--accent-color);
  border-radius: 8px;
  padding: 10px 12px;
  position: relative;
}

/* 悬浮预览面板 */
.ref-preview-float {
  position: fixed;
  left: 420px;
  top: 50%;
  transform: translateY(-50%);
  width: 640px;
  height: 360px;
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  z-index: 9999;
  pointer-events: none;
}

.ref-preview-float img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--card-bg);
}

.ref-preview-iframe {
  width: 1280px;
  height: 720px;
  border: none;
  transform: scale(0.5);
  transform-origin: top left;
}

.ref-preview-text {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 1rem;
  gap: 8px;
}

.ref-preview-name {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  max-width: 80%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ref-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ref-icon {
  font-size: 1.1rem;
}

.ref-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ref-type {
  font-size: 0.7rem;
  color: var(--accent-color);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.ref-name {
  font-size: 0.85rem;
  color: var(--text-primary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.2s;
}

.clear-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--error-color);
}

.upload-area {
  display: flex;
  align-items: center;
}

.upload-btn {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--card-bg);
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.upload-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
  background: var(--accent-bg);
}

.upload-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-icon {
  font-size: 0.85rem;
}

.upload-hint {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  display: none;
}

.url-input-row {
  display: flex;
  gap: 8px;
}

.url-input-row input {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 0.8rem;
}

.url-input-row input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.url-add-btn {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}

.url-add-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.url-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 选项区域 */
.options-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.options-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* 生成按钮行 */
.generate-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.auto-fix-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.auto-fix-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-color);
  cursor: pointer;
}

.auto-fix-checkbox:hover {
  color: var(--text-primary);
}

.auto-fix-checkbox input[type="checkbox"]:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.loop-count-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.loop-label {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.loop-count-input {
  width: 45px;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 0.85rem;
  text-align: center;
}

.loop-count-input:hover:not(:disabled) {
  border-color: var(--accent-color);
}

.loop-count-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.loop-count-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 生成按钮 */
.generate-btn {
  flex: 1;
  background: var(--accent-gradient);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 16px 24px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: var(--shadow-md);
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(184, 115, 51, 0.3);
}

.generate-btn:active:not(:disabled) {
  transform: translateY(0);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 流式输出展示 */
.stream-output {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.stream-output label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
  flex-shrink: 0;
}

.stream-textarea {
  flex: 1;
  min-height: 0;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  font-size: 0.72rem;
  font-family: "Consolas", "Monaco", monospace;
  color: var(--text-secondary);
  resize: none;
  line-height: 1.5;
}

.stream-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* PPTX 页面选择弹窗 */
.pptx-selector-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.pptx-selector-modal {
  background: var(--panel-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.pptx-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.pptx-selector-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.pptx-selector-close {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.2rem;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.pptx-selector-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.pptx-selector-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pptx-slide-item {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.pptx-slide-item:hover {
  border-color: var(--accent-color);
  background: var(--accent-bg);
}

.pptx-slide-header {
  margin-bottom: 8px;
}

.pptx-slide-num {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent-color);
}

.pptx-slide-preview {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.5;
  max-height: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
