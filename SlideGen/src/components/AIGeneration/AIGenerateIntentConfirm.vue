<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue';
import type { IntentQuestion } from '../../services/customAiService';

const props = defineProps<{
  questions: IntentQuestion[];
  isThinking?: boolean;
  thinkingDuration?: number;
}>();

const emit = defineEmits<{
  (e: 'confirm', data: any): void;
}>();

// Local State for Questions (Mutable)
const localQuestions = ref<IntentQuestion[]>([]);

// Dynamic Form Data
const formData = ref<Record<string, any>>({});
const thinkingText = ref('AI 正在拆解您的需求...');
let thinkingInterval: any = null;

// Adding Option State
const addingOptionState = ref<{ questionId: string, value: string } | null>(null);

// Countdown Logic
const countdown = ref(60);
const totalTime = 60;
let countdownTimer: any = null;
const isAutoConfirmPaused = ref(false);

const thinkingMessages = [
  '正在分析设计风格偏好...',
  '正在构思最佳展示结构...',
  '正在识别关键内容要素...',
  '正在优化视觉呈现方案...',
  'AI 正在拆解您的需求...'
];

// Initialize form data based on questions
onMounted(() => {
  initLocalQuestions();
  initForm();
  if (props.isThinking) {
    startThinkingAnimation();
  }
});

onUnmounted(() => {
  if (thinkingInterval) clearInterval(thinkingInterval);
  if (countdownTimer) clearInterval(countdownTimer);
});

watch(() => props.questions, () => {
  initLocalQuestions();
  initForm();
  startCountdown();
}, { deep: true });

function initLocalQuestions() {
  // Deep copy questions to local mutable state
  localQuestions.value = JSON.parse(JSON.stringify(props.questions));
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdown.value = totalTime;
  isAutoConfirmPaused.value = false;
  
  countdownTimer = setInterval(() => {
    if (isAutoConfirmPaused.value) return;
    
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(countdownTimer);
      handleConfirm();
    }
  }, 1000);
}

function stopCountdown() {
  isAutoConfirmPaused.value = true;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

function startThinkingAnimation() {
  if (thinkingInterval) clearInterval(thinkingInterval);
  let index = 0;
  thinkingInterval = setInterval(() => {
    thinkingText.value = thinkingMessages[index % thinkingMessages.length];
    index++;
  }, 2000);
}

function initForm() {
  const data: Record<string, any> = {};
  localQuestions.value.forEach(q => {
    if (q.type === 'checkbox') {
      // Use default if available (ensure it's array), otherwise empty
      data[q.id] = Array.isArray(q.default) ? q.default : [];
    } else {
      // Use default if available, otherwise first option, otherwise empty
      if (q.default) {
        data[q.id] = q.default;
      } else if (q.options && q.options.length > 0) {
        data[q.id] = q.options[0];
      } else {
        data[q.id] = '';
      }
    }
  });
  // Always add supplement field if not present
  if (!data.supplement) {
    data.supplement = '';
  }
  formData.value = data;
}

// Add Option Logic
function startAddingOption(questionId: string) {
  addingOptionState.value = { questionId, value: '' };
  stopCountdown(); // Use stopCountdown instead of handleUserInteraction
  nextTick(() => {
    const input = document.getElementById(`add-option-input-${questionId}`);
    input?.focus();
  });
}

function cancelAddingOption() {
  addingOptionState.value = null;
}

function confirmAddingOption(question: IntentQuestion) {
  if (!addingOptionState.value || !addingOptionState.value.value.trim()) {
    cancelAddingOption();
    return;
  }
  
  const newValue = addingOptionState.value.value.trim();
  
  // Add to options if not exists
  if (!question.options) question.options = [];
  if (!question.options.includes(newValue)) {
    question.options.push(newValue);
  }
  
  // Select the new value
  if (question.type === 'radio') {
    formData.value[question.id] = newValue;
  } else if (question.type === 'checkbox') {
    if (!formData.value[question.id]) formData.value[question.id] = [];
    if (!formData.value[question.id].includes(newValue)) {
      formData.value[question.id].push(newValue);
    }
  }
  
  addingOptionState.value = null;
}

// Select All Logic
function toggleSelectAll(question: IntentQuestion) {
  stopCountdown(); // Pause countdown
  const currentSelected = formData.value[question.id] || [];
  const allOptions = question.options || [];
  
  if (currentSelected.length === allOptions.length) {
    // Deselect all
    formData.value[question.id] = [];
  } else {
    // Select all
    formData.value[question.id] = [...allOptions];
  }
}

function isAllSelected(question: IntentQuestion) {
  const currentSelected = formData.value[question.id] || [];
  const allOptions = question.options || [];
  return currentSelected.length === allOptions.length && allOptions.length > 0;
}

function handleConfirm() {
  if (countdownTimer) clearInterval(countdownTimer);
  emit('confirm', formData.value);
}

function handleUserInteraction() {
  stopCountdown();
}
</script>

<template>
  <div class="intent-confirm-container">
    <!-- Loading State -->
    <div v-if="isThinking" class="thinking-container">
      <div class="thinking-animation">
        <div class="thinking-icon-wrapper">
          <i class="fa-solid fa-brain fa-bounce"></i>
        </div>
        <div class="thinking-status-text">{{ thinkingText }}</div>
      </div>
    </div>

    <div v-else>

      <div class="thinking-result">
        <span class="thinking-text">已完成深度思考</span>
        <span class="thinking-time">（用时 {{ thinkingDuration || 0 }} 秒）</span>
        <i class="fa-solid fa-chevron-down result-icon"></i>
      </div>
      
      <div class="confirmation-desc">
        由于这是一个需要深度研究的复杂主题，这需要进一步了解你的具体要求。让我来确认一下：
      </div>

      <div class="confirmation-card">
        <div class="card-header">
          <div class="card-title">请确认创作意图</div>
          <div class="card-subtitle">帮你生成更符合预期的高质量内容</div>
        </div>

        <div class="form-scroll-area">
          <div class="form-items">
            <div 
              v-for="(question, index) in localQuestions" 
              :key="question.id"
              class="form-item"
            >
            <div class="question-header">
              <div class="form-label">{{ index + 1 }}. {{ question.text }}</div>
              <div v-if="question.description" class="question-desc">{{ question.description }}</div>
            </div>
            
            <!-- Radio Options -->
            <div v-if="question.type === 'radio' && question.options" class="options-grid">
              <label 
                v-for="option in question.options" 
                :key="option"
                class="option-btn"
                :class="{ active: formData[question.id] === option }"
                @click="stopCountdown"
              >
                <input type="radio" v-model="formData[question.id]" :value="option" class="hidden-input">
                <span class="radio-circle"></span>
                <span class="option-text">{{ option }}</span>
              </label>

              <!-- Add Option Button -->
              <div class="add-option-wrapper">
                 <div v-if="addingOptionState?.questionId === question.id" class="add-option-input-container">
                    <input 
                      :id="`add-option-input-${question.id}`"
                      type="text" 
                      v-model="addingOptionState.value" 
                      class="add-option-input"
                      placeholder="输入新选项"
                      @blur="confirmAddingOption(question)"
                      @keyup.enter="confirmAddingOption(question)"
                      @keyup.esc="cancelAddingOption"
                    >
                 </div>
                 <button v-else class="add-option-btn" @click="startAddingOption(question.id)">
                    <i class="fa-solid fa-plus"></i> 添加选项
                 </button>
              </div>
            </div>

            <!-- Checkbox Options -->
            <div v-else-if="question.type === 'checkbox' && question.options" class="options-grid">
              <div class="options-toolbar">
                 <button class="select-all-btn" @click="toggleSelectAll(question)">
                   {{ isAllSelected(question) ? '取消全选' : '全选' }}
                 </button>
              </div>

              <label 
                v-for="option in question.options" 
                :key="option"
                class="option-btn checkbox-style"
                :class="{ active: formData[question.id]?.includes(option) }"
                @click="stopCountdown"
              >
                <input type="checkbox" v-model="formData[question.id]" :value="option" class="hidden-input">
                <span class="checkbox-square">
                  <i class="fa-solid fa-check check-icon"></i>
                </span>
                <span class="option-text">{{ option }}</span>
              </label>

               <!-- Add Option Button -->
              <div class="add-option-wrapper">
                 <div v-if="addingOptionState?.questionId === question.id" class="add-option-input-container">
                    <input 
                      :id="`add-option-input-${question.id}`"
                      type="text" 
                      v-model="addingOptionState.value" 
                      class="add-option-input"
                      placeholder="输入新选项"
                      @blur="confirmAddingOption(question)"
                      @keyup.enter="confirmAddingOption(question)"
                      @keyup.esc="cancelAddingOption"
                    >
                 </div>
                 <button v-else class="add-option-btn" @click="startAddingOption(question.id)">
                    <i class="fa-solid fa-plus"></i> 添加选项
                 </button>
              </div>
            </div>

            <!-- Text Input -->
          <input 
            v-else-if="question.type === 'text'"
            type="text" 
            v-model="formData[question.id]" 
            class="text-input" 
            :placeholder="question.text"
            @input="handleUserInteraction"
          >
        </div>

        <!-- Default Supplement Input -->
        <div class="form-item">
          <div class="form-label">我要补充</div>
          <input type="text" v-model="formData.supplement" placeholder="请输入补充内容" class="text-input supplement-input" @input="handleUserInteraction">
        </div>
      </div>

      <div class="card-footer">
        <div class="status-text">你已进入编辑模式，完成修改后需要确认，任务才会继续执行</div>
        <button class="confirm-btn" @click="handleConfirm">
          <div class="btn-content">
            <span>确认意图并执行</span>
            <div v-if="!isAutoConfirmPaused && countdown > 0" class="countdown-circle">
              <svg viewBox="0 0 36 36" class="circular-chart">
                <path class="circle-bg"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path class="circle"
                  :stroke-dasharray="`${(countdown / totalTime) * 100}, 100`"
                  d="M18 2.0845
                    a 15.9155 15.9155 0 0 1 0 31.831
                    a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <text x="18" y="20.35" class="percentage">{{ countdown }}</text>
              </svg>
            </div>
          </div>
        </button>
      </div>
      </div>
    </div>
  </div>
</div>
</template>

<style scoped>
.intent-confirm-container {
  padding: 0 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  min-height: 400px;
  /* Allow content to grow and scroll within parent modal */
  flex: 1;
}

/* Thinking Loading Style */
.thinking-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  flex-direction: column;
}

.thinking-animation {
  text-align: center;
}

.thinking-icon-wrapper {
  font-size: 48px;
  color: #2979ff;
  margin-bottom: 24px;
  background: #f0f7ff;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto 24px;
}

.thinking-status-text {
  font-size: 16px;
  color: #333;
  font-weight: 500;
  animation: fadeInOut 2s infinite;
}

@keyframes fadeInOut {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-icon {
  font-size: 14px;
}

.status-title {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.toggle-icon {
  font-size: 12px;
  color: #666;
  margin-left: 8px;
}

.thinking-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
  margin-bottom: 16px;
}

.thinking-text {
  color: #666;
}

.result-icon {
  font-size: 12px;
  margin-left: 4px;
}

.confirmation-desc {
  font-size: 14px;
  color: #333;
  margin-bottom: 24px;
  line-height: 1.6;
}

/* Main Card Style */
.confirmation-card {
  background: linear-gradient(180deg, #fff5f7 0%, #fff 100%); /* Soft pinkish gradient at top */
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
}

.card-header {
  margin-bottom: 24px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.card-subtitle {
  font-size: 12px;
  color: #666;
}

.form-scroll-area {
  max-height: 480px;
  overflow-y: auto;
  padding-right: 12px;
  margin-right: -12px;
}

.form-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.form-scroll-area::-webkit-scrollbar-thumb {
  background-color: #eee;
  border-radius: 3px;
}

.form-scroll-area::-webkit-scrollbar-thumb:hover {
  background-color: #ddd;
}

/* Form Items */
.form-items {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.question-header {
  margin-bottom: 12px;
}

.question-desc {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  margin-left: 2px;
}

.form-label {
  font-size: 14px;
  color: #333;
  font-weight: 500;
  line-height: 1.5;
  margin-bottom: 0;
}

/* Options Grid */
.options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center; /* Align items vertically */
}

.options-toolbar {
  width: 100%;
  margin-bottom: 8px;
}

.select-all-btn {
  background: none;
  border: 1px solid #e0e0e0;
  border-radius: 14px;
  padding: 2px 10px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.2s;
}

.select-all-btn:hover {
  border-color: #4a6ee0;
  color: #4a6ee0;
}

.option-btn {
  display: flex;
  align-items: flex-start; /* Align top for multiline */
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 20px; /* Pill shape */
  font-size: 13px;
  color: #333;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  min-width: fit-content; /* Adjust width to content */
  max-width: 100%;
  box-sizing: border-box;
  text-align: left; /* Left align text */
  white-space: normal; /* Allow wrapping */
}

.radio-circle, .checkbox-square {
  flex-shrink: 0; /* Prevent shrinking */
  margin-top: 2px; /* Align with first line of text */
}

.option-text {
  line-height: 1.4;
  word-break: break-word; /* Prevent overflow */
}

/* Add Option Button */
.add-option-wrapper {
  display: flex;
  align-items: center;
}

.add-option-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px dashed #ccc;
  border-radius: 20px;
  font-size: 13px;
  color: #666;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  height: 38px; /* Match option-btn height approx */
}

.add-option-btn:hover {
  border-color: #4a6ee0;
  color: #4a6ee0;
  background: #f0f4ff;
}

.add-option-input-container {
  display: flex;
  align-items: center;
}

.add-option-input {
  padding: 8px 12px;
  border: 1px solid #4a6ee0;
  border-radius: 20px;
  font-size: 13px;
  outline: none;
  width: 200px;
  height: 38px;
  box-sizing: border-box;
}

.option-btn:hover {
  border-color: #4a6ee0; /* Hover color */
}

.option-btn.active {
  border-color: #4a6ee0;
  color: #4a6ee0;
  background: #f0f4ff; /* Light blue bg for active */
}

.hidden-input {
  display: none;
}

/* Custom Radio Circle */
.radio-circle {
  width: 14px;
  height: 14px;
  border: 1px solid #ccc;
  border-radius: 50%;
  margin-right: 8px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.option-btn.active .radio-circle {
  border-color: #4a6ee0;
}

.option-btn.active .radio-circle::after {
  content: '';
  width: 8px;
  height: 8px;
  background: #4a6ee0;
  border-radius: 50%;
}

/* Custom Checkbox Square */
.checkbox-square {
  width: 14px;
  height: 14px;
  border: 1px solid #ccc;
  border-radius: 2px;
  margin-right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
}

.option-btn.checkbox-style.active .checkbox-square {
  background: #4a6ee0;
  border-color: #4a6ee0;
}

.check-icon {
  display: none;
}

.option-btn.checkbox-style.active .check-icon {
  display: block;
}

/* Text Input */
.text-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  color: #333;
  box-sizing: border-box;
}

.text-input:focus {
  border-color: #4a6ee0;
}

.supplement-input::placeholder {
  color: #aaa;
}

/* Footer */
.card-footer {
  margin-top: 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20px;
  border-top: 1px solid #f0f0f0; /* Optional separator */
}

.status-text {
  font-size: 12px;
  color: #999;
}

.confirm-btn {
  background: #000; /* Black button as in screenshot */
  color: #fff;
  border: none;
  padding: 8px 24px;
  border-radius: 20px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.confirm-btn:hover {
  opacity: 0.8;
}

.btn-content {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center; /* Ensure horizontal alignment */
  height: 20px; /* Fix height to align with text */
}

.countdown-circle {
  width: 18px; /* Slightly smaller */
  height: 18px;
  display: flex; /* Flex to center svg */
  align-items: center;
}

.circular-chart {
  display: block;
  margin: 0 auto;
  max-width: 100%;
  max-height: 100%;
}

.circle-bg {
  fill: none;
  stroke: #eee;
  stroke-width: 3.8;
}

.circle {
  fill: none;
  stroke-width: 2.8;
  stroke-linecap: round;
  animation: progress 1s ease-out forwards;
  stroke: #fff;
  transition: stroke-dasharray 1s linear;
}

.percentage {
  fill: #fff;
  font-family: sans-serif;
  font-weight: bold;
  font-size: 14px; /* text size relative to viewbox */
  text-anchor: middle;
  dominant-baseline: middle; /* Vertical center alignment */
}
</style>