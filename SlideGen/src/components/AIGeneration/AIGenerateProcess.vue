<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'complete'): void;
}>();

const progress = ref(0);
const currentStep = ref(1); // 1, 2, 3
const steps = [
  { id: 1, title: '规划 PPT 内容大纲和页面结构' },
  { id: 2, title: '创建 PPT 页面布局' },
  { id: 3, title: '准备生成 PPT' }
];

let timer: any = null;

onMounted(() => {
  // 模拟进度
  timer = setInterval(() => {
    if (progress.value < 100) {
      progress.value += 1;
      
      // 更新步骤状态
      if (progress.value < 40) {
        currentStep.value = 1;
      } else if (progress.value < 80) {
        currentStep.value = 2;
      } else {
        currentStep.value = 3;
      }
    } else {
      clearInterval(timer);
      emit('complete');
    }
  }, 50); // 5秒完成演示，可调整
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

function handleStop() {
  emit('cancel');
}
</script>

<template>
  <div class="process-container">
    <!-- Top Icon -->
    <div class="loading-icon-wrapper">
      <div class="loading-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none">
          <path d="M33.25 17.5C33.9271 17.5 34.4971 17.9855 34.6535 18.6442L35.277 21.2719C36.2125 25.2184 36.68 27.1918 37.6932 28.7926C38.5891 30.2081 39.7877 31.4073 41.203 32.3035C42.8035 33.317 44.7766 33.7857 48.7225 34.7219L51.3535 35.3455C52.0129 35.5018 52.5 36.0723 52.5 36.75C52.5 37.4271 52.0134 37.9972 51.3546 38.1535L48.7225 38.7781C44.7765 39.7143 42.8035 40.183 41.203 41.1965C39.7877 42.0927 38.5891 43.2919 37.6932 44.7074C36.68 46.3082 36.2125 48.2816 35.277 52.2281L34.6535 54.8546C34.4972 55.5134 33.9271 56 33.25 56C32.5723 56 32.0017 55.5129 31.8454 54.8535L31.223 52.2281C30.2875 48.2816 29.82 46.3082 28.8068 44.7074C27.9109 43.2919 26.7123 42.0927 25.297 41.1965C23.6965 40.183 21.7234 39.7143 17.7775 38.7781L15.1442 38.1534C14.4855 37.9971 14 37.4271 14 36.75C14 36.0723 14.486 35.5018 15.1454 35.3455L17.7775 34.7219C21.7234 33.7857 23.6965 33.317 25.297 32.3035C26.7123 31.4073 27.9109 30.2081 28.8068 28.7926C29.82 27.1918 30.2875 25.2184 31.223 21.2719L31.8455 18.6454C32.0018 17.986 32.5723 17.5 33.25 17.5Z" fill="#8350F2"></path>
          <path opacity="0.6" d="M12.25 7C12.6809 7 13.0436 7.30893 13.1431 7.72815L13.5399 9.40032C14.1352 11.9117 14.4327 13.1675 15.0775 14.1862C15.6476 15.087 16.4104 15.8501 17.311 16.4204C18.3295 17.0653 19.5851 17.3636 22.0962 17.9594L23.7704 18.3562C24.19 18.4557 24.5 18.8187 24.5 19.25C24.5 19.6809 24.1904 20.0436 23.7711 20.1431L22.0962 20.5406C19.5851 21.1364 18.3295 21.4347 17.311 22.0796C16.4104 22.6499 15.6476 23.413 15.0775 24.3138C14.4327 25.3325 14.1352 26.5883 13.5399 29.0997L13.1432 30.7711C13.0437 31.1904 12.6809 31.5 12.25 31.5C11.8187 31.5 11.4556 31.1901 11.3562 30.7704L10.9601 29.0997C10.3648 26.5883 10.0673 25.3325 9.42253 24.3138C8.85241 23.413 8.08964 22.6499 7.18899 22.0796C6.17052 21.4347 4.91491 21.1364 2.40384 20.5406L0.728156 20.1431C0.308934 20.0436 0 19.6809 0 19.25C0 18.8187 0.309252 18.4557 0.728889 18.3563L2.40384 17.9594C4.91492 17.3636 6.17052 17.0653 7.18899 16.4204C8.08964 15.8501 8.8524 15.087 9.42253 14.1862C10.0673 13.1675 10.3648 11.9117 10.9601 9.40032L11.3562 7.72888C11.4557 7.30924 11.8187 7 12.25 7Z" fill="#8350F2"></path>
          <path opacity="0.3" d="M29.75 0C29.9347 1.97666e-07 30.0901 0.132397 30.1328 0.312064L30.3028 1.02871C30.5579 2.10501 30.6855 2.64323 30.9618 3.07979C31.2061 3.46584 31.533 3.7929 31.919 4.03732C32.3555 4.31372 32.8936 4.44155 33.9698 4.69689L34.6873 4.86695C34.8672 4.90957 35 5.06517 35 5.25C35 5.43466 34.8673 5.59013 34.6876 5.63277L33.9698 5.80311C32.8936 6.05845 32.3555 6.18628 31.919 6.46268C31.533 6.7071 31.2061 7.03416 30.9618 7.42021C30.6855 7.85677 30.5579 8.39499 30.3028 9.47129L30.1328 10.1876C30.0901 10.3673 29.9347 10.5 29.75 10.5C29.5652 10.5 29.4096 10.3672 29.3669 10.1873L29.1972 9.47129C28.9421 8.39499 28.8145 7.85677 28.5382 7.42021C28.2939 7.03416 27.967 6.7071 27.581 6.46268C27.1445 6.18629 26.6064 6.05845 25.5302 5.80311L24.8121 5.63275C24.6324 5.59013 24.5 5.43465 24.5 5.25C24.5 5.06518 24.6325 4.90958 24.8124 4.86697L25.5302 4.69689C26.6064 4.44155 27.1445 4.31372 27.581 4.03732C27.967 3.7929 28.2939 3.46584 28.5382 3.07979C28.8145 2.64323 28.9421 2.10501 29.1972 1.02871L29.367 0.312377C29.4096 0.132533 29.5652 0 29.75 0Z" fill="#8350F2"></path>
        </svg>
      </div>
      <div class="loading-text">生成单页中，预计耗时 2 分钟</div>
    </div>

    <!-- Steps -->
    <div class="steps-container">
      <div v-for="step in steps" :key="step.id" class="step-item" :class="{ 'active': step.id === currentStep, 'completed': step.id < currentStep, 'pending': step.id > currentStep }">
        <div class="step-icon">
          <!-- Loading Icon (Active) -->
          <div v-if="step.id === currentStep" class="step-loading-icon">
            <i class="fa-solid fa-spinner fa-spin" style="color: #8350F2;"></i>
          </div>
          <!-- Check Icon (Completed) -->
          <div v-else-if="step.id < currentStep" class="step-check-icon">
             <i class="fa-solid fa-check" style="color: #fff;"></i>
          </div>
          <!-- Number (Pending) -->
          <div v-else class="step-number">{{ step.id }}</div>
        </div>
        <div class="step-title">{{ step.title }}</div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="progress-section">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <div class="progress-text">{{ progress }}%</div>
    </div>

    <!-- Stop Button -->
    <div class="stop-section">
      <button class="stop-btn" @click="handleStop">
        <i class="fa-solid fa-stop"></i> 停止 Esc
      </button>
    </div>
  </div>
</template>

<style scoped>
.process-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 0;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.loading-icon-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40px;
}

.loading-icon {
  margin-bottom: 16px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

.loading-text {
  font-size: 16px;
  color: #333;
  font-weight: 500;
}

.steps-container {
  width: 100%;
  margin-bottom: 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  opacity: 0.6;
  transition: all 0.3s;
}

.step-item.active {
  opacity: 1;
}

.step-item.completed {
  opacity: 1;
}

.step-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.step-loading-icon {
  font-size: 18px;
}

.step-check-icon {
  width: 20px;
  height: 20px;
  background: #8350F2;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.step-number {
  width: 20px;
  height: 20px;
  border: 1px solid #ccc;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #999;
}

.step-item.active .step-title {
  font-weight: 600;
  color: #8350F2;
}

.progress-section {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 40px;
}

.progress-bar-bg {
  flex: 1;
  height: 6px;
  background: #f0f0f0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: #8350F2;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  color: #666;
  min-width: 40px;
  text-align: right;
}

.stop-section {
  margin-top: auto;
}

.stop-btn {
  background: #f5f5f5;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.2s;
}

.stop-btn:hover {
  background: #e0e0e0;
  color: #333;
}
</style>


