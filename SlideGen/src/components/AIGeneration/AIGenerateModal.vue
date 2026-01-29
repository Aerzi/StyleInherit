<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import AIGenerateIntentConfirm from './AIGenerateIntentConfirm.vue';
import { generateIntentQuestions, type IntentQuestion } from '../../services/customAiService';
import { extractStyleFromImage } from '../../keepstyle/extractStyleService';
import { generateSlide } from '../../keepstyle/generateService';

const props = defineProps<{
  modelValue: boolean;
  currentSlideImage?: { id: string; url: string; name: string };
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'generate', prompt: string): void;
  (e: 'generated-result', result: any): void;
}>();

const prompt = ref('');
const isGenerating = ref(false);
const isConfirming = ref(false); // New state for intent confirmation
const isThinking = ref(false); // State for analyzing intent
const thinkingTime = ref(0);
const intentQuestions = ref<IntentQuestion[]>([]);
const selectedMode = ref('base'); // base, web, pro, style-inherit
const selectedLayout = ref('smart'); // smart, left-img, multi-col, etc.

// Confirmation Form Data
const confirmForm = ref<Record<string, any>>({});
let thinkingTimer: any = null;

const modes = computed(() => {
  const baseModes = [
    {
      id: 'base',
      title: '基础版式',
      desc: '卡片式布局，信息结构简单，后续可灵活调整版式结构',
      icon: 'fa-solid fa-layer-group',
      image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/tab-base.svg'
    },
    {
      id: 'web',
      title: '网页风格',
      desc: '专为工作汇报、数据分析设计，生成图表类结构',
      icon: 'fa-solid fa-chart-simple',
      image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/tab-html.png'
    },
    {
      id: 'pro',
      title: '专业设计师',
      desc: '生图模式，适用于概念展示，全景图讲清核心理念',
      icon: 'fa-regular fa-image',
      image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/tab-image.png'
    }
  ];

  if (props.currentSlideImage) {
    baseModes.push({
      id: 'style-inherit',
      title: '样式保持',
      desc: '基于当前选中幻灯片样式的风格迁移与内容生成',
      icon: 'fa-solid fa-wand-magic-sparkles',
      image: props.currentSlideImage.url
    });
  }

  return baseModes;
});

interface LayoutItem {
  id: string;
  title: string;
  desc?: string;
  image?: string;
  isSmart?: boolean;
  isUpload?: boolean;
}

const baseLayouts: LayoutItem[] = [
  { id: 'smart', title: '智能匹配', desc: 'AI 根据内容进行匹配', isSmart: true },
  { id: 'left-img', title: '左配图右多文', image: 'https://basicsvr-test.ks3-cn-beijing.ksyuncs.com/%2Flayout/preview/zuo-nei-rong-you-duo-wen.svg?Expires=4857803034&AWSAccessKeyId=AKLTSGk7pwQhSsgjTpg8XMlw&Signature=gyNZAPS44GP4N6pYkpW1XkfHt8o%3D' },
  { id: 'multi-col', title: '多列文本', image: 'https://basicsvr-test.ks3-cn-beijing.ksyuncs.com/%2Flayout/preview/duo-lie-wen-ben.svg?Expires=4857803034&AWSAccessKeyId=AKLTSGk7pwQhSsgjTpg8XMlw&Signature=MFCZyFu8YwpO0UyK%2ByLKR8Hd840%3D' },
  { id: 'multi-content', title: '多列内容配图', image: 'https://basicsvr-test.ks3-cn-beijing.ksyuncs.com/%2Flayout/preview/duo-lie-nei-rong-pei-tu.svg?Expires=4857803034&AWSAccessKeyId=AKLTSGk7pwQhSsgjTpg8XMlw&Signature=%2B7wgj2q8XutjiA4Zd4lhCO3NSP4%3D' },
  { id: 'multi-row', title: '多行文本', image: 'https://basicsvr-test.ks3-cn-beijing.ksyuncs.com/%2Flayout/preview/duo-hang-wen-ben.svg?Expires=4857803034&AWSAccessKeyId=AKLTSGk7pwQhSsgjTpg8XMlw&Signature=GTAyuKR6EIX6Wa1svQMSu1wN3b0%3D' },
  { id: 'left-text', title: '左文右图', image: 'https://basicsvr-test.ks3-cn-beijing.ksyuncs.com/%2Flayout/preview/zuo-wen-you-nei-rong.svg?Expires=4857803034&AWSAccessKeyId=AKLTSGk7pwQhSsgjTpg8XMlw&Signature=NTVb%2BmS0t8JLegEv6r0z6L%2FSqlk%3D' },
];

const webLayouts: LayoutItem[] = [
  { id: 'smart', title: '智能匹配', desc: 'AI 根据内容进行匹配', isSmart: true },
  { id: 'data-compare', title: '多维数据对比', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/image1.jpeg' },
  { id: 'funnel', title: '数据漏斗转化', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/image2.jpeg' },
  { id: 'metrics', title: '多维业务指标', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/image3.jpeg' },
  { id: 'dashboard', title: '仪表盘看板', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/image4.jpeg' },
  { id: 'capability', title: '能力对比映射', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251230/image5.jpeg' },
];

const proLayouts: LayoutItem[] = [
  { id: 'upload', title: '上传 PPT 图片', isUpload: true },
  { id: 'scene', title: '现场拍摄', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251231/recommand-3.png' },
  { id: 'immersive', title: '沉浸效果', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251231/recommend-2.png' },
  { id: 'logic', title: '逻辑图示', image: 'https://ai-webwpp.ks3-cn-beijing.ksyuncs.com/banana/generate-slide/20251231/recommand-1.png' },
];

const currentLayouts = computed(() => {
  if (selectedMode.value === 'web') return webLayouts;
  if (selectedMode.value === 'pro') return proLayouts;
  return baseLayouts;
});

// Watch mode change to reset selected layout to the first available option
watch(selectedMode, (newMode) => {
  if (newMode === 'pro') {
    selectedLayout.value = 'scene'; // Default to first image instead of upload for cleaner UX
  } else {
    selectedLayout.value = 'smart';
  }
});

// Helper to convert URL to Base64
async function urlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function handleGenerateClick() {
  if (!prompt.value.trim()) return;
  
  // Style Preservation Mode: Bypass Intent Confirmation and run direct generation
  if (selectedMode.value === 'style-inherit' && props.currentSlideImage) {
    await handleStyleInheritGeneration();
    return;
  }
  
  // Start thinking process and switch view IMMEDIATELY
  isThinking.value = true;
  isConfirming.value = true; // Show confirm screen immediately with loading state
  intentQuestions.value = []; // Clear previous questions
  const startTime = Date.now();
  
  thinkingTime.value = 0;
  thinkingTimer = setInterval(() => {
    thinkingTime.value++;
  }, 1000);

  try {
    let imagesForIntent: string[] | undefined = undefined;
    
    // Call AI to generate clarifying questions
    const response = await generateIntentQuestions(prompt.value, imagesForIntent);
    
    // Calculate actual duration
    const endTime = Date.now();
    thinkingTime.value = Math.round((endTime - startTime) / 1000); // Update with actual duration in seconds
    if (thinkingTime.value < 1) thinkingTime.value = 1; // Minimum 1s

    if (response && response.questions && response.questions.length > 0) {
      intentQuestions.value = response.questions;
    } else {
      // Fallback if no questions generated, just generate the slide
      handleConfirmAndGenerate({}); 
    }
  } catch (error) {
    console.error('Intent recognition failed:', error);
    // Fallback: Just generate directly if intent recognition fails
    handleConfirmAndGenerate({});
  } finally {
    isThinking.value = false;
    if (thinkingTimer) clearInterval(thinkingTimer);
  }
}

async function handleStyleInheritGeneration() {
  isGenerating.value = true;
  
  try {
    if (!props.currentSlideImage) throw new Error('No image selected');
    
    // 1. Get Image Base64
    const base64 = await urlToBase64(props.currentSlideImage.url);
    
    // 2. Extract Style (using KeepStyle logic)
    // prompt.value is passed as userPrompt to guide extraction if needed (e.g. specific color overrides mentioned in prompt)
    const styleResult = await extractStyleFromImage({
      imageBase64s: [base64],
      userPrompt: prompt.value 
    });
    
    // 3. Generate Slide (using KeepStyle logic)
    const generateResult = await generateSlide({
      styleDescription: styleResult.styleDescription,
      userPrompt: prompt.value,
      outputType: 'html',
      width: 1280,
      height: 720
    });
    
    emit('generated-result', generateResult);
    emit('generate', prompt.value);
    emit('update:modelValue', false);
    
  } catch (e) {
    console.error('Style inherit generation failed:', e);
    alert('生成失败: ' + (e instanceof Error ? e.message : String(e)));
  } finally {
    isGenerating.value = false;
  }
}

async function handleConfirmAndGenerate(data: any) {
  // Combine original prompt with confirmed intent details
  confirmForm.value = data;
  
  let detailedPrompt = `主题：${prompt.value}\n`;
  
  // Append answers to prompt based on questions
  if (intentQuestions.value.length > 0) {
    intentQuestions.value.forEach(q => {
      const answer = data[q.id];
      if (answer) {
        const answerText = Array.isArray(answer) ? answer.join('、') : answer;
        detailedPrompt += `${q.text.replace(/[?？]/g, '')}：${answerText}\n`;
      }
    });
  }

  if (data.supplement) {
    detailedPrompt += `补充说明：${data.supplement}`;
  }

  emit('generate', detailedPrompt);
  isConfirming.value = false;
  // Close the modal as well
  emit('update:modelValue', false);
}

function handleClose() {
  emit('update:modelValue', false);
  isConfirming.value = false; // Reset state
  isThinking.value = false;
  if (thinkingTimer) clearInterval(thinkingTimer);
}
</script>

<template>
  <div v-if="modelValue" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <!-- Close Button -->
      <button class="close-btn" @click="handleClose">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <!-- Header -->
      <div class="modal-header">
        <h2>灵感瞬间生成，细节随心修改</h2>
      </div>

      <!-- Main Input Area (Hidden when confirming) -->
      <div v-if="!isConfirming" class="input-section">
        <div class="input-wrapper">
          <textarea 
            v-model="prompt" 
            placeholder="请输入幻灯片正文页主题或粘贴大纲内容"
            class="main-textarea"
          ></textarea>
          
          <div class="input-footer">
            <div class="footer-tools">
              <button class="tool-btn"><i class="fa-solid fa-globe"></i> 联网搜索</button>
              <button class="tool-btn"><i class="fa-solid fa-brain"></i> 深度思考</button>
              <button class="tool-btn lang-btn"><i class="fa-solid fa-language"></i> 中文 <i class="fa-solid fa-chevron-down"></i></button>
            </div>
            
            <div class="footer-actions">
              <div class="page-count">
                生成 1 页 <i class="fa-solid fa-chevron-down"></i>
              </div>
              <button 
                class="generate-btn" 
                :disabled="!prompt.trim() || isGenerating || isThinking"
                @click="handleGenerateClick"
              >
                <template v-if="isThinking">
                  <i class="fa-solid fa-spinner fa-spin"></i> 思考中...
                </template>
                <template v-else>
                  立即生成 <i class="fa-solid fa-arrow-right"></i>
                </template>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Intent Confirmation Section (Shown when confirming) -->
      <AIGenerateIntentConfirm 
        v-else 
        :questions="intentQuestions"
        :is-thinking="isThinking"
        :thinking-duration="thinkingTime"
        @confirm="handleConfirmAndGenerate"
      />

      <!-- Settings Section (Only show when not confirming) -->
      <div v-if="!isConfirming" class="settings-section">
        <!-- Modes -->
        <div class="setting-group">
          <h3 class="group-title">选择生成模式</h3>
          <div class="mode-list">
            <div 
              v-for="mode in modes" 
              :key="mode.id"
              class="mode-item"
              :class="{ active: selectedMode === mode.id }"
              @click="selectedMode = mode.id"
            >
              <div class="mode-info">
                <div class="mode-header">
                  <i :class="mode.icon"></i>
                  <span>{{ mode.title }}</span>
                </div>
                <div class="mode-desc">{{ mode.desc }}</div>
              </div>
              <div class="mode-img">
                <img :src="mode.image" :alt="mode.title">
              </div>
            </div>
          </div>
        </div>

        <!-- Layouts -->
        <div class="setting-group">
          <h3 class="group-title">选择版式</h3>
          <div class="layout-list">
            <div 
              v-for="layout in currentLayouts" 
              :key="layout.id"
              class="layout-item"
              :class="{ active: selectedLayout === layout.id, 'upload-item': layout.isUpload }"
              @click="selectedLayout = layout.id"
            >
              <div v-if="layout.isSmart" class="smart-match-content">
                <div class="smart-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
                <div class="layout-name">智能匹配</div>
                <div class="layout-desc">AI 根据内容匹配</div>
              </div>
              <div v-else-if="layout.isUpload" class="upload-content">
                <div class="upload-icon-wrapper">
                  <i class="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <div class="layout-name">上传 PPT 图片</div>
                <div class="layout-desc">上传或拖拽图片</div>
              </div>
              <template v-else>
                <div class="layout-preview">
                  <img :src="layout.image" :alt="layout.title">
                </div>
                <div class="layout-name">{{ layout.title }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
}

.modal-container {
  background: #fff;
  width: 1100px;
  max-width: 95vw;
  height: 820px;
  max-height: 88vh;
  border-radius: 20px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  padding: 40px;
  position: relative;
  overflow-y: auto;
  animation: modalScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
}

.input-section, .settings-section {
  flex-shrink: 0; /* Prevent shrinking */
}

@keyframes modalScaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: none;
  border: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.modal-header {
  text-align: center;
  margin-bottom: 30px;
}

.modal-header h2 {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

/* Input Section */
.input-wrapper {
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  margin-bottom: 30px;
  transition: all 0.3s;
}

.input-wrapper:focus-within {
  border-color: #d32f2f;
  box-shadow: 0 4px 20px rgba(211, 47, 47, 0.1);
}

.main-textarea {
  width: 100%;
  height: 120px;
  border: none;
  resize: none;
  font-size: 16px;
  line-height: 1.6;
  outline: none;
  color: #333;
  font-family: inherit;
}

.main-textarea::placeholder {
  color: #aaa;
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 10px;
}

.footer-tools {
  display: flex;
  gap: 12px;
}

.tool-btn {
  background: none;
  border: none;
  color: #666;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  transition: all 0.2s;
}

.tool-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.footer-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-count {
  font-size: 14px;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.generate-btn {
  background: linear-gradient(90deg, #b983ff 0%, #9f7aea 100%); /* Purple gradient like screenshot */
  color: #fff;
  border: none;
  padding: 8px 24px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.3s;
}

.generate-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(159, 122, 234, 0.3);
}

.generate-btn:disabled {
  background: #e0e0e0;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Settings Section */
.group-title {
  font-size: 14px;
  color: #666;
  font-weight: 500;
  margin-bottom: 12px;
}

.setting-group {
  margin-bottom: 24px;
}

/* Modes */
.mode-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.mode-item {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
  position: relative;
  overflow: hidden;
}

.mode-item:hover {
  border-color: #2979ff; /* Blue hover like screenshot */
  background: #f0f7ff;
}

.mode-item.active {
  border-color: #2979ff;
  background: #e3f2fd;
}

.mode-info {
  flex: 1;
  padding-right: 10px;
  z-index: 2;
}

.mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-weight: 600;
  font-size: 14px;
  color: #333;
}

.mode-desc {
  font-size: 12px;
  color: #666; /* Darker text for readability */
  line-height: 1.4;
}

.mode-img {
  width: 80px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mode-img img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* Layouts */
.layout-list {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 10px;
}

.layout-item {
  min-width: 140px;
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  background: #fff;
}

.layout-item:hover {
  border-color: #2979ff;
}

.layout-item.active {
  border-color: #2979ff;
  background: #e3f2fd;
}

.smart-match-content {
  height: 90px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: #f0f7ff; /* Light blue bg */
  border-radius: 8px;
  margin-bottom: 8px;
  color: #2979ff;
}

.smart-icon {
  font-size: 24px;
  color: #2979ff;
  margin-bottom: 8px;
}

.layout-desc {
  font-size: 10px;
  color: #2979ff; /* Blue text */
}

.layout-preview {
  height: 90px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.layout-preview img {
  max-width: 100%;
  max-height: 100%;
}

.layout-name {
  font-size: 13px;
  color: #333;
}

.upload-item {
  border-style: dashed !important;
  border-color: #999;
}

.upload-content {
  height: 90px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin-bottom: 8px;
  color: #666;
}

.upload-icon-wrapper {
  font-size: 24px;
  color: #2979ff;
  margin-bottom: 8px;
}

/* Confirmation Section Styles removed as they are now in AIGenerateIntentConfirm.vue */

</style>