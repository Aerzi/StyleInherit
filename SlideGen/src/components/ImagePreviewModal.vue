<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";

const props = defineProps<{
  show: boolean;
  url: string;
  title?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const scale = ref(1);
const fitScale = ref(1);
const isRealSize = ref(false);
const minScale = 0.1;
const maxScale = 5;

// 监听 show 变化，打开时计算适应屏幕的缩放比例
watch(
  () => props.show,
  (isShow) => {
    if (isShow && props.url) {
      isRealSize.value = false;
      const img = new Image();
      img.onload = () => {
        const vw = window.innerWidth * 0.9;
        const vh = window.innerHeight * 0.85;
        const scaleX = vw / img.naturalWidth;
        const scaleY = vh / img.naturalHeight;
        fitScale.value = Math.min(scaleX, scaleY, 1);
        scale.value = fitScale.value;
      };
      img.src = props.url;
    }
  }
);

// 缩放
function zoom(delta: number) {
  const newScale = scale.value + delta;
  if (newScale >= minScale && newScale <= maxScale) {
    scale.value = newScale;
  }
}

// 鼠标滚轮缩放
function handleWheel(e: WheelEvent) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoom(delta);
}

// ESC 键关闭
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.show) {
    emit("close");
  }
}

// 双击切换：完整展示 ↔ 真实尺寸
function handleDoubleClick() {
  if (isRealSize.value) {
    scale.value = fitScale.value;
    isRealSize.value = false;
  } else {
    scale.value = 1;
    isRealSize.value = true;
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="preview-overlay"
      @click="emit('close')"
      @wheel="handleWheel"
    >
      <div class="preview-header">
        <span class="preview-title">{{ title || "图片预览" }}</span>
        <div class="preview-controls">
          <button @click.stop="zoom(0.2)" title="放大">➕</button>
          <span class="scale-info">{{ Math.round(scale * 100) }}%</span>
          <button @click.stop="zoom(-0.2)" title="缩小">➖</button>
          <button @click.stop="scale = fitScale" title="适应屏幕">📐</button>
          <button @click.stop="scale = 1" title="原始尺寸">1:1</button>
          <button @click.stop="emit('close')" title="关闭 (ESC)">✕</button>
        </div>
      </div>
      <img
        :src="url"
        class="preview-full-image"
        :style="{ transform: `scale(${scale})` }"
        @click.stop
        @dblclick.stop="handleDoubleClick"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.92);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.preview-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  z-index: 10000;
}

.preview-title {
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-controls button {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.preview-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
}

.scale-info {
  color: white;
  font-size: 0.85rem;
  min-width: 55px;
  height: 40px;
  text-align: center;
  background: rgba(255, 255, 255, 0.1);
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: "Consolas", monospace;
}

.preview-full-image {
  max-width: 95vw;
  max-height: 85vh;
  object-fit: contain;
  cursor: default;
  transition: transform 0.15s ease-out;
  border-radius: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}
</style>

