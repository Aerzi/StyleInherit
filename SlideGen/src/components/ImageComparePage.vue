<script setup lang="ts">
import { ref, computed, watch } from "vue";
import ImagePreviewModal from "./ImagePreviewModal.vue";

interface ImageData {
  file: File | null;
  url: string;
  name: string;
  width: number;
  height: number;
}

interface CompareResult {
  diffPercent: number;
  totalPixels: number;
  diffPixels: number;
  diffImageUrl?: string; // 差异图的 dataURL
}

const emit = defineEmits<{
  back: [];
}>();

const image1 = ref<ImageData>({
  file: null,
  url: "",
  name: "",
  width: 0,
  height: 0,
});
const image2 = ref<ImageData>({
  file: null,
  url: "",
  name: "",
  width: 0,
  height: 0,
});
const isComparing = ref(false);
const compareResult = ref<CompareResult | null>(null);

// 图片预览状态
const showPreview = ref(false);
const previewUrl = ref("");
const previewTitle = ref("");

// 打开预览
function openPreview(url: string, title: string) {
  previewUrl.value = url;
  previewTitle.value = title;
  showPreview.value = true;
}

// 关闭预览
function closePreview() {
  showPreview.value = false;
}

// 文件选择
async function handleFileSelect(imageNum: 1 | 2, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const target = imageNum === 1 ? image1 : image2;

  // 清理旧的 URL
  if (target.value.url) {
    URL.revokeObjectURL(target.value.url);
  }

  // 加载图片获取尺寸
  try {
    const img = await loadImage(url);
    target.value = {
      file,
      url,
      name: file.name,
      width: img.width,
      height: img.height,
    };
  } catch {
    target.value = { file, url, name: file.name, width: 0, height: 0 };
  }

  // 重置对比结果
  compareResult.value = null;
}

// 当两张图都选择后自动对比
watch([image1, image2], async () => {
  if (image1.value.file && image2.value.file) {
    await doCompare();
  }
});

// 执行对比
async function doCompare() {
  if (!image1.value.file || !image2.value.file) return;

  isComparing.value = true;
  compareResult.value = null;

  try {
    const [img1, img2] = await Promise.all([
      loadImage(image1.value.url),
      loadImage(image2.value.url),
    ]);

    const result = compareImages(img1, img2);
    compareResult.value = result;
  } catch (error) {
    console.error("对比失败:", error);
    compareResult.value = { diffPercent: -1, totalPixels: 0, diffPixels: 0 };
  } finally {
    isComparing.value = false;
  }
}

// 加载图片
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// 对比图片
function compareImages(
  img1: HTMLImageElement,
  img2: HTMLImageElement,
  threshold: number = 30
): CompareResult {
  // 使用较大图的尺寸作为对比面板
  const width = Math.max(img1.width, img2.width);
  const height = Math.max(img1.height, img2.height);

  // 确定哪个是较大的图（用于基础灰度图）
  const largerImg =
    img1.width * img1.height >= img2.width * img2.height ? img1 : img2;

  // 创建 canvas 绘制图片1（原始尺寸，左上角对齐，不缩放）
  const canvas1 = document.createElement("canvas");
  canvas1.width = width;
  canvas1.height = height;
  const ctx1 = canvas1.getContext("2d")!;
  ctx1.fillStyle = "#ffffff";
  ctx1.fillRect(0, 0, width, height);
  ctx1.drawImage(img1, 0, 0); // 原始尺寸绘制

  // 创建 canvas 绘制图片2（原始尺寸，左上角对齐，不缩放）
  const canvas2 = document.createElement("canvas");
  canvas2.width = width;
  canvas2.height = height;
  const ctx2 = canvas2.getContext("2d")!;
  ctx2.fillStyle = "#ffffff";
  ctx2.fillRect(0, 0, width, height);
  ctx2.drawImage(img2, 0, 0); // 原始尺寸绘制

  // 创建较大图的灰度 canvas（作为基础）
  const largerCanvas = document.createElement("canvas");
  largerCanvas.width = width;
  largerCanvas.height = height;
  const largerCtx = largerCanvas.getContext("2d")!;
  largerCtx.fillStyle = "#ffffff";
  largerCtx.fillRect(0, 0, width, height);
  largerCtx.drawImage(largerImg, 0, 0);

  // 创建差异 canvas
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext("2d")!;

  const data1 = ctx1.getImageData(0, 0, width, height).data;
  const data2 = ctx2.getImageData(0, 0, width, height).data;
  const largerData = largerCtx.getImageData(0, 0, width, height).data;
  const diffImageData = diffCtx.createImageData(width, height);
  const diffData = diffImageData.data;

  const totalPixels = width * height;
  let diffPixels = 0;

  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i],
      g1 = data1[i + 1],
      b1 = data1[i + 2];
    const r2 = data2[i],
      g2 = data2[i + 1],
      b2 = data2[i + 2];

    // 较大图的像素（用于灰度底图）
    const rL = largerData[i],
      gL = largerData[i + 1],
      bL = largerData[i + 2];

    const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);

    if (diff > threshold) {
      diffPixels++;
      // 差异部分：红色
      diffData[i] = 220; // R
      diffData[i + 1] = 50; // G
      diffData[i + 2] = 50; // B
      diffData[i + 3] = 255; // A
    } else {
      // 相同部分：较大图的灰度版本
      const gray = Math.round((rL + gL + bL) / 3);
      diffData[i] = gray;
      diffData[i + 1] = gray;
      diffData[i + 2] = gray;
      diffData[i + 3] = 255;
    }
  }

  diffCtx.putImageData(diffImageData, 0, 0);

  const diffPercent = Math.round((diffPixels / totalPixels) * 10000) / 100;

  // 将 canvas 转为 dataURL
  const diffImageUrl = diffCanvas.toDataURL("image/png");

  return {
    diffPercent,
    totalPixels,
    diffPixels,
    diffImageUrl,
  };
}

// 清除选择
function clearImage(imageNum: 1 | 2) {
  const target = imageNum === 1 ? image1 : image2;
  if (target.value.url) {
    URL.revokeObjectURL(target.value.url);
  }
  target.value = { file: null, url: "", name: "", width: 0, height: 0 };
  compareResult.value = null;
}

// 格式化差异度
const diffLabel = computed(() => {
  if (!compareResult.value) return "";
  const diff = compareResult.value.diffPercent;
  if (diff < 0) return "对比失败";
  if (diff === 0) return "完全相同";
  if (diff < 1) return "< 1%";
  return `${diff.toFixed(2)}%`;
});

const diffLevel = computed(() => {
  if (!compareResult.value || compareResult.value.diffPercent < 0) return "";
  const diff = compareResult.value.diffPercent;
  if (diff < 5) return "low";
  if (diff < 20) return "medium";
  return "high";
});

// 对比尺寸（较大图的尺寸）
const compareSize = computed(() => {
  if (!image1.value.width || !image2.value.width) return null;
  return {
    width: Math.max(image1.value.width, image2.value.width),
    height: Math.max(image1.value.height, image2.value.height),
  };
});
</script>

<template>
  <div class="compare-page">
    <header class="page-header">
      <button class="back-btn" @click="emit('back')">← 返回</button>
      <h1 class="page-title">图片对比工具</h1>
    </header>

    <div class="compare-container">
      <!-- 图片1 -->
      <div class="image-column">
        <div class="column-header">
          <h3 class="column-title">图片 1</h3>
          <span v-if="image1.width > 0" class="size-label">
            {{ image1.width }} × {{ image1.height }} px
          </span>
        </div>
        <div class="image-box" :class="{ 'has-image': image1.url }">
          <template v-if="image1.url">
            <img
              :src="image1.url"
              :alt="image1.name"
              class="preview-img clickable"
              @click="openPreview(image1.url, '图片 1')"
            />
            <div class="image-info">
              <span class="file-name">{{ image1.name }}</span>
              <button class="clear-btn" @click="clearImage(1)">✕</button>
            </div>
          </template>
          <template v-else>
            <label class="upload-area">
              <input
                type="file"
                accept="image/*"
                @change="(e) => handleFileSelect(1, e)"
                hidden
              />
              <div class="upload-icon">📁</div>
              <span class="upload-text">点击选择图片</span>
            </label>
          </template>
        </div>
      </div>

      <!-- 图片2 -->
      <div class="image-column">
        <div class="column-header">
          <h3 class="column-title">图片 2</h3>
          <span v-if="image2.width > 0" class="size-label">
            {{ image2.width }} × {{ image2.height }} px
          </span>
        </div>
        <div class="image-box" :class="{ 'has-image': image2.url }">
          <template v-if="image2.url">
            <img
              :src="image2.url"
              :alt="image2.name"
              class="preview-img clickable"
              @click="openPreview(image2.url, '图片 2')"
            />
            <div class="image-info">
              <span class="file-name">{{ image2.name }}</span>
              <button class="clear-btn" @click="clearImage(2)">✕</button>
            </div>
          </template>
          <template v-else>
            <label class="upload-area">
              <input
                type="file"
                accept="image/*"
                @change="(e) => handleFileSelect(2, e)"
                hidden
              />
              <div class="upload-icon">📁</div>
              <span class="upload-text">点击选择图片</span>
            </label>
          </template>
        </div>
      </div>

      <!-- 结果 -->
      <div class="result-column">
        <div class="column-header">
          <h3 class="column-title">对比结果</h3>
          <span v-if="compareSize" class="size-label">
            {{ compareSize.width }} × {{ compareSize.height }} px
          </span>
        </div>
        <div class="result-box">
          <template v-if="isComparing">
            <div class="loading-state">
              <div class="spinner"></div>
              <span>正在对比...</span>
            </div>
          </template>
          <template v-else-if="compareResult">
            <div class="result-content">
              <div class="diff-indicator" :class="diffLevel">
                <span class="diff-value">{{ diffLabel }}</span>
                <span class="diff-desc">差异度</span>
              </div>
              <div class="diff-stats">
                <div class="stat-item">
                  <span class="stat-label">总像素</span>
                  <span class="stat-value">{{
                    compareResult.totalPixels.toLocaleString()
                  }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">差异像素</span>
                  <span class="stat-value">{{
                    compareResult.diffPixels.toLocaleString()
                  }}</span>
                </div>
              </div>
              <div class="diff-preview">
                <h4>图像叠加对比</h4>
                <img
                  v-if="compareResult.diffImageUrl"
                  :src="compareResult.diffImageUrl"
                  alt="差异对比图"
                  class="diff-image clickable"
                  @click="
                    openPreview(
                      compareResult.diffImageUrl || '',
                      '图像叠加对比'
                    )
                  "
                />
                <p class="diff-legend">
                  <span class="legend-same">■ 灰色 = 相同像素</span>
                  <span class="legend-diff">■ 红色 = 差异像素</span>
                </p>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="empty-state">
              <div class="empty-icon">📊</div>
              <span>请选择两张图片进行对比</span>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 图片预览弹窗 -->
    <ImagePreviewModal
      :show="showPreview"
      :url="previewUrl"
      :title="previewTitle"
      @close="closePreview"
    />
  </div>
</template>

<style scoped>
.compare-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--main-bg);
  padding: 24px;
  width: 100%;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.back-btn {
  padding: 8px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.compare-container {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 24px;
  min-height: 0;
}

.image-column,
.result-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.column-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.size-label {
  font-size: 0.75rem;
  font-family: "Consolas", monospace;
  color: var(--text-tertiary);
  background: var(--card-bg);
  padding: 2px 8px;
  border-radius: 4px;
}

.image-box,
.result-box {
  flex: 1;
  background: var(--panel-bg);
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  min-height: 300px;
}

.image-box.has-image {
  border-style: solid;
}

.upload-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 40px;
  width: 100%;
  height: 100%;
  transition: all 0.2s;
}

.upload-area:hover {
  background: var(--hover-bg);
}

.upload-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.upload-text {
  font-size: 0.95rem;
  color: var(--text-secondary);
}

.preview-img {
  max-width: 100%;
  max-height: calc(100% - 40px);
  object-fit: contain;
}

.image-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
}

.file-name {
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clear-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.8);
}

/* 结果区域 */
.result-box {
  border-style: solid;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-tertiary);
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-content {
  width: 100%;
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.diff-indicator {
  text-align: center;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 16px;
}

.diff-indicator.low {
  background: rgba(34, 197, 94, 0.1);
}

.diff-indicator.medium {
  background: rgba(234, 179, 8, 0.1);
}

.diff-indicator.high {
  background: rgba(239, 68, 68, 0.1);
}

.diff-value {
  display: block;
  font-size: 2.5rem;
  font-weight: 700;
  font-family: "Consolas", monospace;
}

.diff-indicator.low .diff-value {
  color: #22c55e;
}

.diff-indicator.medium .diff-value {
  color: #eab308;
}

.diff-indicator.high .diff-value {
  color: #ef4444;
}

.diff-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.diff-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.stat-item {
  flex: 1;
  background: var(--card-bg);
  padding: 12px;
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 1rem;
  font-weight: 600;
  font-family: "Consolas", monospace;
  color: var(--text-primary);
}

.diff-preview {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.diff-preview h4 {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.diff-image {
  flex: 1;
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: #fff;
}

.diff-legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.legend-diff {
  color: #ef4444;
}

.legend-same {
  color: #888;
}

/* 可点击图片样式 */
.clickable {
  cursor: pointer;
  transition: opacity 0.2s;
}

.clickable:hover {
  opacity: 0.9;
}
</style>
