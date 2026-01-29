<template>
  <div class="keepstyle-panel">
    <div class="panel-header">
      <h1>🎨 样式保持生成</h1>
      <p class="subtitle">上传图片提取样式，根据样式和提示词生成幻灯片</p>
    </div>

    <div class="panel-content">
      <!-- 顶部 Tab 切换 -->
      <div class="tabs-header">
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'single' }"
          @click="activeTab = 'single'"
        >
          单张生成
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: activeTab === 'batch' }"
          @click="activeTab = 'batch'"
        >
          批量运行
        </button>
      </div>

      <!-- 单张生成模式 -->
      <div v-if="activeTab === 'single'" class="single-mode-container">
      <!-- 左侧：配置区域 -->
      <div class="left-panel">
        <div class="form-section">
          <!-- 上传图片 -->
          <div class="form-field">
            <label class="form-label">上传参考图片</label>
            <div class="upload-section">
              <input
                ref="imageInput"
                type="file"
                accept="image/*"
                multiple
                style="display: none"
                @change="handleImageSelect"
              />
              <div
                v-if="imagePreviews.length === 0"
                class="upload-area"
                :class="{ dragging: isDragging }"
                @click="triggerImageSelect"
                @dragenter.prevent="handleDragEnter"
                @dragover.prevent="handleDragOver"
                @dragleave.prevent="handleDragLeave"
                @drop.prevent="handleDrop"
              >
                <div class="upload-placeholder">
                  <i class="upload-icon">📷</i>
                  <p>点击、拖拽或粘贴上传图片（支持多张）</p>
                </div>
              </div>
              <div v-else class="images-preview-container">
                <div
                  v-for="(preview, index) in imagePreviews"
                  :key="index"
                  class="image-preview-item"
                >
                  <img :src="preview" alt="预览" class="preview-image" />
                  <button
                    class="remove-image-btn"
                    @click="removeImage(index)"
                    title="移除图片"
                  >
                    ×
                  </button>
                  <div class="image-index">{{ index + 1 }}</div>
                  <div class="image-controls">
                    <button
                      class="move-btn"
                      @click="moveImageUp(index)"
                      :disabled="index === 0"
                      title="上移"
                    >
                      ↑
                    </button>
                    <button
                      class="move-btn"
                      @click="moveImageDown(index)"
                      :disabled="index === imagePreviews.length - 1"
                      title="下移"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 配置区域 -->
          <div class="config-section">
            <div class="config-group">
              
              <!-- 用户输入 -->
              <div class="form-field">
                <label class="form-label">
                  用户输入
                  <span class="hint">（如："创建一个关于产品介绍的幻灯片"）</span>
                </label>
                <textarea
                  v-model="generateUserPrompt"
                  class="prompt-input"
                  placeholder="请输入生成指令或主题..."
                  rows="4"
                  :disabled="isProcessing"
                ></textarea>
              </div>

              <!-- 调用次数 -->
              <div class="form-field">
                <label class="form-label">
                  调用生成次数
                  <span class="hint">（样式提取迭代次数）</span>
                </label>
                <input
                  v-model.number="extractLoopCount"
                  type="number"
                  min="1"
                  max="10"
                  class="number-input"
                  :disabled="isProcessing"
                />
              </div>

              <!-- 生成模式 -->
              <div class="form-field">
                <label class="form-label">生成模式</label>
                <div class="radio-group">
                  <label class="radio-item">
                    <input
                      type="radio"
                      value="html"
                      v-model="outputType"
                      :disabled="isProcessing"
                    />
                    <span>HTML</span>
                  </label>
                  <label class="radio-item">
                    <input
                      type="radio"
                      value="image"
                      v-model="outputType"
                      :disabled="isProcessing"
                    />
                    <span>图片</span>
                  </label>
                </div>
              </div>

              <!-- HTML模板 (HTML Only) -->
              <div v-if="outputType === 'html'" class="form-field">
                <label class="form-label">
                  HTML参考模板
                </label>
                <select
                  v-model="selectedHtmlTemplateId"
                  class="model-select"
                  :disabled="isProcessing"
                  @change="handleTemplateSelect"
                >
                  <option value="">不使用模板</option>
                  <option
                    v-for="template in htmlTemplates"
                    :key="template.id"
                    :value="template.id"
                    :disabled="template.is_blacklist"
                  >
                    {{ template.label.logical_relation }} - {{ template.label.chart_type }}
                    {{ template.is_blacklist ? '(已禁用)' : '' }}
                  </option>
                </select>
              </div>

              <!-- 图片参考图 (Image Only) -->
              <div v-if="outputType === 'image'" class="form-field">
                <label class="form-label">
                  图片参考图
                  <span class="hint">（Picture Reference Map）</span>
                </label>
                <div class="upload-section">
                  <input
                    ref="refImageInput"
                    type="file"
                    accept="image/*"
                    multiple
                    style="display: none"
                    @change="handleRefImageSelect"
                  />
                  <div
                    v-if="refImagePreviews.length === 0"
                    class="upload-area"
                    @click="triggerRefImageSelect"
                    @mouseenter="isHoveringRefUpload = true"
                    @mouseleave="isHoveringRefUpload = false"
                  >
                    <div class="upload-placeholder">
                      <i class="upload-icon">🖼️</i>
                      <p>点击或粘贴参考图</p>
                    </div>
                  </div>
                  <div v-else class="images-preview-container"
                    @mouseenter="isHoveringRefUpload = true"
                    @mouseleave="isHoveringRefUpload = false"
                  >
                    <div
                      v-for="(preview, index) in refImagePreviews"
                      :key="index"
                      class="image-preview-item"
                    >
                      <img :src="preview" alt="预览" class="preview-image" />
                      <button
                        class="remove-image-btn"
                        @click="removeRefImage(index)"
                        title="移除图片"
                      >
                        ×
                      </button>
                      <div class="image-index">{{ index + 1 }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作按钮组 -->
          <div class="button-group">
            <button
              class="generate-btn primary-btn"
              :disabled="imageFiles.length === 0 || isProcessing"
              @click="handleGenerateAll"
            >
              <span v-if="isProcessing" class="loading-spinner"></span>
              <span v-if="isProcessing">
                {{ currentStage === 'extracting' ? '提取样式中...' : '生成中...' }}
              </span>
              <span v-else>开始生成 (提取 + 生成)</span>
            </button>
          </div>

        </div>
      </div>

      <!-- 右侧预览区域 -->
      <div class="right-panel">
        <div v-if="!isProcessing && !extractedStyle && !result" class="empty-state">
          <div class="empty-icon">🎨</div>
          <h3>准备就绪</h3>
          <p>上传图片并点击"开始生成"以查看结果</p>
        </div>

        <div v-else class="preview-container">
          <!-- 阶段一结果展示 -->
          <div v-if="extractStreamContent || extractedStyle" class="stage-result">
             <!-- 样式详情收缩面板 (优化版) -->
             <div class="style-details">
                <div class="style-details-header">
                    <span class="style-title">🎨 样式提取结果</span>
                    <div class="style-actions">
                         <span class="style-length" v-if="extractedStyle">{{ extractedStyle.styleDescription.length }} chars</span>
                         <button class="copy-style-btn" @click="copyToClipboard(extractedStyle ? extractedStyle.styleDescription : extractStreamContent)">复制</button>
                    </div>
                </div>
                <div class="style-content-wrapper">
                    <pre class="style-content">{{ extractedStyle ? extractedStyle.styleDescription : extractStreamContent }}</pre>
                </div>
             </div>
          </div>

          <!-- 阶段二结果展示 -->
          <div v-if="result || generateStreamContent" class="stage-result">
            <h3 class="stage-title">
              <span class="stage-icon">🖼️</span>
              生成结果
              <span v-if="isGenerating" class="loading-dot">...</span>
            </h3>
            
            <div class="result-display">
              <!-- HTML 预览 -->
              <div v-if="outputType === 'html'" class="html-preview-wrapper" ref="htmlPreviewWrapper">
                <div 
                  v-if="result?.html" 
                  class="iframe-scale-container"
                  :style="{ 
                    transform: `translate(-50%, -50%) scale(${scale})`
                  }"
                >
                  <iframe 
                    :srcdoc="result.html" 
                    class="preview-iframe"
                    frameborder="0"
                  ></iframe>
                </div>
                <div v-else class="loading-placeholder">
                  <pre class="stream-content">{{ generateStreamContent }}</pre>
                </div>
              </div>

              <!-- 图片预览 -->
              <div v-if="outputType === 'image'" class="image-preview-wrapper">
                <img 
                  v-if="result?.imageUrl" 
                  :src="result.imageUrl" 
                  class="preview-image"
                />
                <div v-else class="loading-placeholder">
                   <pre class="stream-content">{{ generateStreamContent }}</pre>
                </div>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div v-if="result" class="result-actions">
              <button class="action-btn" @click="handleAudit" :disabled="isAuditing">
                <span v-if="isAuditing" class="loading-spinner small"></span>
                {{ isAuditing ? '对比分析中...' : '样式对比审计' }}
              </button>
              <button class="action-btn" @click="outputType === 'html' ? downloadHtml() : downloadImage()">
                下载{{ outputType === 'html' ? 'HTML' : '图片' }}
              </button>
              <button v-if="outputType === 'html'" class="action-btn secondary" @click="copyToClipboard(result.html)">
                复制HTML代码
              </button>
            </div>
          </div>

          <!-- 阶段三：样式对比结果 -->
          <div v-if="auditResult" class="stage-result">
            <h3 class="stage-title">
              <span class="stage-icon">⚖️</span>
              样式对比报告
              <span class="score-badge" :style="{ background: getScoreColor(auditResult.matchScore) }">
                {{ auditResult.matchScore }}分
              </span>
            </h3>

            <div class="audit-content">
              <div class="score-section">
                <div class="score-circle" :style="getScoreCircleStyle(auditResult.matchScore)">
                  <div class="score-inner">
                    <span class="score-value">{{ auditResult.matchScore }}%</span>
                    <span class="score-label">一致性系数</span>
                  </div>
                </div>
                <p class="score-desc">基于 V6.2 协议的多维加权评估</p>
              </div>

              <div class="gene-table-section">
                <h4>基因差异对照表</h4>
                <div class="gene-grid">
                  <div class="gene-item">
                    <div class="gene-icon">🎨</div>
                    <div class="gene-info">
                      <span class="gene-label">背景纯度</span>
                      <span class="gene-value">{{ auditResult.geneTable.backgroundColor }}</span>
                    </div>
                  </div>
                  <div class="gene-item">
                    <div class="gene-icon">✨</div>
                    <div class="gene-info">
                      <span class="gene-label">强调色系</span>
                      <span class="gene-value">{{ auditResult.geneTable.accentColor }}</span>
                    </div>
                  </div>
                  <div class="gene-item">
                    <div class="gene-icon">A</div>
                    <div class="gene-info">
                      <span class="gene-label">字体色/对比</span>
                      <span class="gene-value">{{ auditResult.geneTable.fontColor }}</span>
                    </div>
                  </div>
                  <div class="gene-item">
                    <div class="gene-icon">💎</div>
                    <div class="gene-info">
                      <span class="gene-label">材质/圆角/投影</span>
                      <span class="gene-value">{{ auditResult.geneTable.materialTexture }}</span>
                    </div>
                  </div>
                  <div class="gene-item">
                    <div class="gene-icon">📐</div>
                    <div class="gene-info">
                      <span class="gene-label">布局/锚点一致性</span>
                      <span class="gene-value">{{ auditResult.geneTable.layout }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="audit-advice">
              <h4>💡 修改建议</h4>
              <p>{{ auditResult.exportAdvice }}</p>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- 批量运行模式 -->
      <div v-if="activeTab === 'batch'" class="batch-panel">
        <div class="batch-config">
          <div class="config-group">
            <h3 class="config-title">📂 批量配置</h3>
            
            <div class="form-field">
              <label class="form-label">上传Excel文件</label>
              <input
                ref="excelInput"
                type="file"
                accept=".xlsx,.xls"
                style="display: none"
                @change="handleExcelSelect"
              />
              <div class="upload-section">
                <button
                  class="upload-btn"
                  @click="triggerExcelSelect"
                  :disabled="isTesting"
                >
                  {{ excelFile ? excelFile.name : '选择Excel文件' }}
                </button>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label">选择图片文件夹（可选）</label>
              <input
                ref="imageFolderInput"
                type="file"
                webkitdirectory
                directory
                style="display: none"
                @change="handleImageFolderSelect"
              />
              <div class="upload-section">
                <button
                  class="upload-btn"
                  @click="triggerImageFolderSelect"
                  :disabled="isTesting"
                >
                  {{ imageFolderFiles.size > 0 ? `已选择 ${imageFolderFiles.size} 个文件` : '选择图片文件夹（可选）' }}
                </button>
              </div>
              <p class="hint" style="font-size: 0.8rem; margin-top: 4px;">
                如果Excel中"正文页"列是图片路径，请选择包含这些图片的文件夹
              </p>
            </div>

            <div class="form-field">
              <label class="form-label">默认模型配置</label>
              <div class="model-info">
                <p>视觉提取: doubao-seed-1.8</p>
                <p>HTML生成: doubao-seed-1.8</p>
                <p>图片生成: Doubao-image-seedream-v4.5</p>
              </div>
            </div>

              <div class="form-field">
                <label class="form-label">HTML模板（可选）</label>
                <div class="template-select-container">
                  <select v-model="selectedHtmlTemplateId" class="model-select" :disabled="isTesting || isProcessing">
                    <option value="">不使用模板 (默认布局)</option>
                    <option v-for="template in htmlTemplates" :key="template.id" :value="template.id">
                      {{ template.id }}. {{ template.label.logical_relation }} - {{ template.label.chart_type }}
                    </option>
                  </select>
                  <div class="template-info" v-if="selectedHtmlTemplateId">
                     <small v-if="isTemplateLoading">正在加载模板...</small>
                     <small v-else-if="selectedHtmlTemplateContent">
                        模板已就绪 ({{ selectedHtmlTemplateContent.length }} 字符)
                        <a :href="getSelectedTemplateUrl()" target="_blank" class="preview-link">预览</a>
                     </small>
                  </div>
                </div>
              </div>

              <div class="form-field">
                <button
                  v-if="!isTesting"
                class="generate-btn test-btn"
                :disabled="!excelFile || isProcessing"
                @click="handleStartTest"
              >
                开始批量运行
              </button>
              <button
                v-else
                class="generate-btn stop-btn"
                @click="handleStopTest"
              >
                停止运行
              </button>
            </div>
            
            <div class="form-field">
                 <button 
                   class="generate-btn secondary-btn" 
                   @click="exportExcel"
                   :disabled="!exceljsWorkbook"
                 >
                   导出结果 Excel
                 </button>
            </div>

            <div v-if="testLog" class="form-field">
              <label class="form-label">运行日志</label>
              <textarea
                v-model="testLog"
                class="prompt-input"
                rows="5"
                readonly
                style="font-size: 12px;"
              ></textarea>
            </div>
          </div>
        </div>

        <div class="batch-results">
          <div class="results-header">
            <h3>运行结果 ({{ batchResultsList.length }})</h3>
          </div>
          <div class="results-list">
             <div v-for="item in batchResultsList" :key="item.id" class="result-item" :class="item.status">
                <div class="item-header">
                  <span class="item-id">#{{ item.id }}</span>
                  <span class="item-status" :class="item.status">{{ item.status }}</span>
                </div>
                <div class="item-content">
                  <div class="item-info">
                    <p><strong>主题:</strong> {{ item.theme }}</p>
                    <div class="image-preview-row" v-if="item.extractedImage">
                        <strong>原图:</strong> 
                        <div class="thumb-container" @click="viewBatchImage(item.extractedImage)">
                             <img :src="item.extractedImage" class="thumb-image" />
                        </div>
                        <span class="file-name" v-if="item.imageName">{{ item.imageName }}</span>
                    </div>
                    <p v-else-if="item.imageName"><strong>图片:</strong> {{ item.imageName }}</p>
                    
                    <!-- 进度状态显示 -->
                    <div class="step-indicator" v-if="item.status === 'processing'">
                      <span :class="{ active: item.step === 'extracting' }">
                        <span v-if="item.step === 'extracting'" class="loading-dot">●</span> 视觉提取
                      </span>
                      <span class="arrow">→</span>
                      <span :class="{ active: item.step === 'generating_html' }">
                        <span v-if="item.step === 'generating_html'" class="loading-dot">●</span> HTML生成
                      </span>
                      <span class="arrow">→</span>
                      <span :class="{ active: item.step === 'generating_image' }">
                        <span v-if="item.step === 'generating_image'" class="loading-dot">●</span> 图片生成
                      </span>
                    </div>
                    
                    <p v-if="item.error" class="error-text">{{ item.error }}</p>
                  </div>
                  <div class="item-actions">
                    <button 
                        v-if="item.styleDescription" 
                        class="btn-small secondary-btn" 
                        @click="item.showStyle = !item.showStyle"
                    >
                        {{ item.showStyle ? '收起样式' : '查看样式' }}
                    </button>
                    <button v-if="item.html" @click="viewBatchHtml(item.html)" class="btn-small success-btn">查看HTML</button>
                    <button v-if="item.imageUrl" @click="viewBatchImage(item.imageUrl)" class="btn-small success-btn">查看图片</button>
                  </div>
                  <div class="manual-actions" v-if="item.extractedImage">
                      <button 
                        class="btn-small secondary-btn" 
                        @click="manualGenerateHtml(item)"
                        :disabled="item.status === 'processing'"
                      >
                        {{ item.html ? '重成HTML' : '生成HTML' }}
                      </button>
                      <button 
                        class="btn-small secondary-btn" 
                        @click="manualGenerateImage(item)"
                        :disabled="item.status === 'processing'"
                      >
                        {{ item.imageUrl ? '重成图片' : '生成图片' }}
                      </button>
                  </div>
                  
                  <!-- 样式详情收缩面板 -->
                  <div v-if="item.showStyle && item.styleDescription" class="style-details">
                    <div class="style-details-header">
                        <span class="style-title">🎨 样式数据</span>
                        <div class="style-actions">
                            <span class="style-length">{{ item.styleDescription.length }} chars</span>
                            <button class="copy-style-btn" @click="copyToClipboard(item.styleDescription)">复制</button>
                        </div>
                    </div>
                    <div class="style-content-wrapper">
                        <pre class="style-content">{{ item.styleDescription }}</pre>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <!-- 预览模态框 -->
      <div v-if="showBatchPreview" class="preview-modal" @click="showBatchPreview = false">
        <div class="preview-content" @click.stop>
          <div class="preview-header">
            <h3>生成预览</h3>
            <button class="close-preview" @click="showBatchPreview = false">×</button>
          </div>
          <div class="preview-body">
            <iframe v-if="batchPreviewHtml" :srcdoc="batchPreviewHtml" frameborder="0" class="preview-iframe"></iframe>
            <img v-if="batchPreviewImage" :src="batchPreviewImage" class="preview-image-full" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue';
import { fetchModels, type ModelInfo } from '../services/llmService';
import { extractStyleFromImage } from '../keepstyle/extractStyleService';
import { generateSlide } from '../keepstyle/generateService';
import { fetchImageModels } from '../keepstyle/imageGenerateService';
import { performPPTAudit, type AuditResult } from '../keepstyle/styleAuditService';
import { fileToBase64 } from '../keepstyle/utils';
import type { StyleExtractResult, GenerateResult } from '../keepstyle/types';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';

// 状态
const activeTab = ref<'single' | 'batch'>('single');
const imageInput = ref<HTMLInputElement | null>(null);
const imageFiles = ref<File[]>([]); // 支持多张图片
const imagePreviews = ref<string[]>([]); // 多张图片预览
const refImageInput = ref<HTMLInputElement | null>(null);
const refImageFiles = ref<File[]>([]); // 阶段二图片参考图
const refImagePreviews = ref<string[]>([]); // 阶段二图片参考图预览
const isHoveringRefUpload = ref(false); // 是否悬停在参考图上传区域
const extractSystemPrompt = ref(''); // 阶段一：系统提示词（可选，留空使用默认）
const extractUserInput = ref(''); // 阶段一：用户输入（用户指令）
const generateSystemPrompt = ref(''); // 阶段二：系统提示词（可选，留空使用默认）
const generateUserPrompt = ref(''); // 阶段二：用户主题（用于图片生成）
const sendImagesToStage2 = ref(false); // 阶段二：是否发送图片
const selectedModel = ref(''); // 第一阶段（样式提取）的模型
const selectedHtmlModel = ref(''); // HTML生成的模型（独立选择）
const selectedImageModel = ref(''); // 图片生成的模型（独立选择）
const outputType = ref<'html' | 'image'>('html');
const imageSize = ref<'1K' | '2K' | '4K'>('1K'); // 图片尺寸
const modelList = ref<ModelInfo[]>([]);
const imageModelList = ref<Array<{ id: string; provider: string }>>([]); // 图片生成模型列表
const isLoadingImageModels = ref(false);

// HTML模板相关
const HTML_TEMPLATES = [
  { id: 1, label: { logical_relation: "对比", chart_type: "柱状图/折线图(左)+表格(右下)+环状图(右上)", id: 1 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_1.html" },
  { id: 10, label: { logical_relation: "总分", chart_type: "饼图/环形图(左)+柱状对比图(右)", id: 10 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_10.html" },
  { id: 11, label: { logical_relation: "总分", chart_type: "数据卡片(左)+堆积柱状图(右)", id: 11 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_11.html" },
  { id: 12, label: { logical_relation: "因果", chart_type: "表格(左)+柱状图(右)+数据卡片", id: 12 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_12.html" },
  { id: 14, label: { logical_relation: "对比", chart_type: "文本卡片(左)+雷达图(中间)+文本卡片(右)+对比说明（底）", id: 14 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_14.html" },
  { id: 15, label: { logical_relation: "对比", chart_type: "对比式文本卡片左右分布", id: 15 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_15.html" },
  { id: 16, label: { logical_relation: "并列", chart_type: "四宫格文本卡片", id: 16 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_16.html" },
  { id: 17, label: { logical_relation: "对比", chart_type: "对比式文本卡片（左纵向）+雷达图（右）", id: 17 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_17.html" },
  { id: 18, label: { logical_relation: "对比", chart_type: "对比式文本卡片（左横向）+雷达能力图（右）", id: 18 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_18.html" },
  { id: 19, label: { logical_relation: "对比", chart_type: "对比式文本卡片(左)+雷达图(右)", id: 19 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_19.html" },
  { id: 2, label: { logical_relation: "递进", chart_type: "趋势分析图(柱状图+折线图)", id: 2 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_2.html" },
  { id: 20, label: { logical_relation: "对比", chart_type: "对比式文本卡片(左)+柱状图(右)", id: 20 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_20.html" },
  { id: 21, label: { logical_relation: "对比", chart_type: "对比式文本卡片(左)+折线图(右)", id: 21 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_21.html" },
  { id: 23, label: { logical_relation: "递进", chart_type: "阶段文本卡片", id: 23 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_23.html" },
  { id: 24, label: { logical_relation: "并列", chart_type: "对比式文本卡片", id: 24 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_24.html" },
  { id: 25, label: { logical_relation: "递进", chart_type: "递进式文本卡片(上)+发展折线图(下)", id: 25 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_25.html" },
  { id: 26, label: { logical_relation: "总分", chart_type: "雷达图(左)+四宫格文本卡片(右)", id: 26 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_26.html" },
  { id: 27, label: { logical_relation: "因果", chart_type: "环状图解释卡片(左)+因果式文本卡片(右)", id: 27 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_27.html" },
  { id: 28, label: { logical_relation: "因果", chart_type: "条形图解释卡片(左)+因果式文本卡片(右)", id: 28 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_28.html" },
  { id: 29, label: { logical_relation: "对比", chart_type: "对比式文本卡片（左）+堆积柱状图（右）", id: 29 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_29.html" },
  { id: 3, label: { logical_relation: "对比", chart_type: "柱状图(左)+数据卡片(右)", id: 3 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_3.html" },
  { id: 30, label: { logical_relation: "因果", chart_type: "折线图解释卡片(左)+因果式文本卡片(右)", id: 30 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_30.html" },
  { id: 31, label: { logical_relation: "递进", chart_type: "递进时间轴", id: 31 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_31.html" },
  { id: 33, label: { logical_relation: "并列", chart_type: "文本解释卡片(左)+因果式文本卡片(右)", id: 33 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_33.html" },
  { id: 4, label: { logical_relation: "对比", chart_type: "表格(左)+柱状图(右)", id: 4 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_4.html" },
  { id: 5, label: { logical_relation: "对比", chart_type: "柱状图(左)+数据卡片(右)", id: 5 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_5.html" },
  { id: 6, label: { logical_relation: "并列", chart_type: "表格(左)+趋势分析图(右)", id: 6 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_6.html" },
  { id: 7, label: { logical_relation: "对比", chart_type: "文本卡片(左)+条形图(右)", id: 7 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_7.html" },
  { id: 8, label: { logical_relation: "递进", chart_type: "漏斗图(左)+数据卡片(右)", id: 8 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_8.html" },
  { id: 9, label: { logical_relation: "总分", chart_type: "直方图(左)+数据卡片(右)", id: 9 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_9.html" },
  { id: 34, label: { logical_relation: "因果", chart_type: "四象限卡片（左）+雷达图（右）", id: 34 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_34.html" },
  { id: 22, label: { logical_relation: "对比", chart_type: "文本解释卡片(左)+雷达图（中）+文本解释卡片(右)", id: 22 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_22.html" },
  { id: 13, label: { logical_relation: "对比", chart_type: "文本解释卡片(左)+雷达图（中）+文本解释卡片(右)", id: 13 }, is_blacklist: false, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_13.html" },
  { id: 32, label: { logical_relation: "对比", chart_type: "文本解释卡片(左)+环形图（右上）+文本解释卡片（右下）", id: 32 }, is_blacklist: true, html_url: "https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_32.html" },
];

const htmlTemplates = ref(HTML_TEMPLATES.sort((a, b) => a.id - b.id));
const selectedHtmlTemplateId = ref<number | ''>('');
const useCustomHtmlTemplate = ref(false);
const customHtmlTemplate = ref('');
const selectedHtmlTemplateContent = ref<string>(''); // 存储选中的模板HTML内容
const isTemplateLoading = ref(false); // 模板加载状态

// 第一阶段调用次数
const extractLoopCount = ref(1); // 默认调用1次

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

// 根据是否有图片过滤模型列表（阶段一需要支持图片的模型）
const filteredModelList = computed(() => {
  if (imageFiles.value.length > 0) {
    // 有图片时，只显示支持多模态的模型
    return modelList.value.filter((m: ModelInfo) => isMultimodalModel(m.id));
  }
  return modelList.value;
});

const isExtracting = ref(false);
const isGenerating = ref(false);
const isAuditing = ref(false);
const currentStage = ref<'extracting' | 'generating' | 'auditing' | ''>(''); // 当前阶段
const extractedStyle = ref<StyleExtractResult | null>(null);
const result = ref<GenerateResult | null>(null);
const auditResult = ref<AuditResult | null>(null);
const extractStreamContent = ref('');
const generateStreamContent = ref('');
const extractStreamTextareaRef = ref<HTMLTextAreaElement | null>(null);
const generateStreamTextareaRef = ref<HTMLTextAreaElement | null>(null);
const htmlPreviewWrapper = ref<HTMLElement | null>(null);
const scale = ref(1);
const isDragging = ref(false);

// 监听窗口大小变化以更新缩放比例
const updateScale = () => {
  if (htmlPreviewWrapper.value) {
    const containerWidth = htmlPreviewWrapper.value.clientWidth;
    const containerHeight = htmlPreviewWrapper.value.clientHeight;
    
    // 计算宽和高的缩放比例，取较小值以适应容器
    const scaleX = containerWidth / 1280;
    const scaleY = containerHeight / 720;
    
    scale.value = Math.min(scaleX, scaleY) * 0.95; // 留一点边距
  }
};

onMounted(() => {
  window.addEventListener('paste', handlePaste);
  window.addEventListener('resize', updateScale);
  // 初始计算
  nextTick(updateScale);
});

onUnmounted(() => {
  window.removeEventListener('paste', handlePaste);
  window.removeEventListener('resize', updateScale);
});

// 监听 result 变化，当有结果时重新计算 scale
watch(result, () => {
  if (result.value?.html) {
    nextTick(updateScale);
  }
});

// 最终发送给模型的提示词
const extractFinalPrompt = ref('');
const generateFinalPrompt = ref('');

// 计算是否正在处理
const isProcessing = computed(() => isExtracting.value || isGenerating.value);

// 测试功能相关状态
const excelInput = ref<HTMLInputElement | null>(null);
const imageFolderInput = ref<HTMLInputElement | null>(null);
const excelFile = ref<File | null>(null);
const imageFolderFiles = ref<Map<string, File>>(new Map()); // 图片文件名 -> File对象
const workbook = ref<XLSX.WorkBook | null>(null);
const exceljsWorkbook = ref<ExcelJS.Workbook | null>(null);
const isTesting = ref(false);
const shouldStopTest = ref(false);
const testLog = ref('');
const batchResultsList = ref<Array<{
  id: number;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
  step: 'idle' | 'extracting' | 'generating_html' | 'generating_image' | 'completed';
  theme: string;
  imageName?: string;
  html?: string;
  imageUrl?: string;
  extractedImage?: string;
  styleDescription?: string;
  showStyle?: boolean; // 控制是否显示样式详情
  error?: string;
}>>([]);
const batchPreviewHtml = ref('');
const batchPreviewImage = ref('');
const showBatchPreview = ref(false);

// 流式输出自动滚动
// 监听模板选择变化，自动加载模板
watch(selectedHtmlTemplateId, async (newId: number | '') => {
  if (newId && !useCustomHtmlTemplate.value) {
    await handleTemplateSelect();
  } else if (!newId) {
    selectedHtmlTemplateContent.value = '';
    isTemplateLoading.value = false;
  }
});

watch(extractStreamContent, () => {
  nextTick(() => {
    if (extractStreamTextareaRef.value) {
      extractStreamTextareaRef.value.scrollTop = extractStreamTextareaRef.value.scrollHeight;
    }
  });
});

watch(generateStreamContent, () => {
  nextTick(() => {
    if (generateStreamTextareaRef.value) {
      generateStreamTextareaRef.value.scrollTop = generateStreamTextareaRef.value.scrollHeight;
    }
  });
});

// 触发文件选择
function triggerImageSelect() {
  imageInput.value?.click();
}

// 拖拽处理
function handleDragEnter() {
  isDragging.value = true;
}

function handleDragOver() {
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

async function handleDrop(event: DragEvent) {
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  if (imageFiles.length > 0) {
    await loadImageFiles(imageFiles);
  }
}

// 处理图片选择（支持多张）
async function handleImageSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length === 0) return;
  await loadImageFiles(files);
}

async function loadImageFiles(files: File[]) {
  const newFiles: File[] = [];
  const newPreviews: string[] = [];
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      newFiles.push(file);
      const base64 = await fileToBase64(file);
      newPreviews.push(base64);
    }
  }
  
  imageFiles.value.push(...newFiles);
  imagePreviews.value.push(...newPreviews);
}

// 监听粘贴事件
function handlePaste(event: ClipboardEvent) {
  // 如果是在输入框中粘贴，忽略
  const target = event.target as HTMLElement;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
    return;
  }

  const items = event.clipboardData?.items;
  if (!items) return;

  const files: File[] = [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        files.push(file);
      }
    }
  }

  if (files.length > 0) {
    // 如果悬停在“图片参考图”区域且处于图片生成模式，则粘贴到该区域
    if (isHoveringRefUpload.value && outputType.value === 'image') {
      loadRefImageFiles(files);
    } else {
      // 否则粘贴到主参考图区域
      loadImageFiles(files);
    }
  }
}


// 触发参考图选择
function triggerRefImageSelect() {
  refImageInput.value?.click();
}

// 处理参考图选择
async function handleRefImageSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length === 0) return;
  await loadRefImageFiles(files);
}

async function loadRefImageFiles(files: File[]) {
  const newFiles: File[] = [];
  const newPreviews: string[] = [];
  
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      newFiles.push(file);
      const base64 = await fileToBase64(file);
      newPreviews.push(base64);
    }
  }
  
  refImageFiles.value.push(...newFiles);
  refImagePreviews.value.push(...newPreviews);
}

// 移除参考图
function removeRefImage(index?: number) {
  if (index !== undefined) {
    refImageFiles.value.splice(index, 1);
    refImagePreviews.value.splice(index, 1);
  } else {
    refImageFiles.value = [];
    refImagePreviews.value = [];
    if (refImageInput.value) {
      refImageInput.value.value = '';
    }
  }
}

// 移除图片
function removeImage(index?: number) {
  if (index !== undefined) {
    // 移除指定索引的图片
    imageFiles.value.splice(index, 1);
    imagePreviews.value.splice(index, 1);
  } else {
    // 移除所有图片
    imageFiles.value = [];
    imagePreviews.value = [];
    extractedStyle.value = null;
    result.value = null;
    auditResult.value = null;
    extractStreamContent.value = '';
    generateStreamContent.value = '';
    extractFinalPrompt.value = '';
    generateFinalPrompt.value = '';
    extractSystemPrompt.value = '';
    extractUserInput.value = '';
    generateSystemPrompt.value = '';
    generateUserPrompt.value = '';
    if (imageInput.value) {
      imageInput.value.value = '';
    }
  }
}

// 图片上移
function moveImageUp(index: number) {
  if (index === 0) return;
  const files = [...imageFiles.value];
  const previews = [...imagePreviews.value];
  
  // 交换位置
  [files[index], files[index - 1]] = [files[index - 1], files[index]];
  [previews[index], previews[index - 1]] = [previews[index - 1], previews[index]];
  
  imageFiles.value = files;
  imagePreviews.value = previews;
}

// 图片下移
function moveImageDown(index: number) {
  if (index === imagePreviews.value.length - 1) return;
  const files = [...imageFiles.value];
  const previews = [...imagePreviews.value];
  
  // 交换位置
  [files[index], files[index + 1]] = [files[index + 1], files[index]];
  [previews[index], previews[index + 1]] = [previews[index + 1], previews[index]];
  
  imageFiles.value = files;
  imagePreviews.value = previews;
}

// 阶段一：仅分析图片（支持连续调用n次）
async function handleExtractOnly() {
  if (imageFiles.value.length === 0) return;

  const loopCount = Math.max(1, Math.min(10, extractLoopCount.value || 1));
  
  isExtracting.value = true;
  currentStage.value = 'extracting';
  // 如果是第一次调用，清空之前的结果；否则追加
  if (extractStreamContent.value === '') {
    extractedStyle.value = null;
    extractFinalPrompt.value = '';
  }

  try {
    // 将多张图片转换为 base64 数组（按照当前顺序）
    const imageBase64s = await Promise.all(
      imageFiles.value.map((file: File) => fileToBase64(file))
    );
    
    // 循环调用n次
    for (let i = 0; i < loopCount; i++) {
      if (i > 0) {
        // 每次调用之间添加分隔符
        extractStreamContent.value += `\n\n${'='.repeat(50)}\n第 ${i + 1} 次调用\n${'='.repeat(50)}\n\n`;
      }
      
      const beforeContent = extractStreamContent.value;
      const startTime = Date.now();
      
      const style = await extractStyleFromImage(
        {
          imageBase64s: imageBase64s,
          systemPrompt: extractSystemPrompt.value.trim() || undefined,
          userPrompt: extractUserInput.value.trim() || undefined,
          model: selectedModel.value || undefined,
        },
        {
          onStreamContent(content) {
            // 追加内容
            if (i === 0) {
              extractStreamContent.value = content;
            } else {
              // 从当前内容开始追加（去掉之前的内容）
              const newContent = content.replace(beforeContent, '');
              extractStreamContent.value = beforeContent + newContent;
            }
          },
          onError(error) {
            console.error(`提取样式失败 (第${i + 1}次):`, error);
            extractStreamContent.value += `\n\n❌ 第 ${i + 1} 次调用错误: ${error}`;
          },
          onPromptReady(prompt) {
            // 只保存最后一次的提示词
            if (i === loopCount - 1) {
              extractFinalPrompt.value = prompt;
            }
          },
        }
      );
      
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      extractStreamContent.value += `\n\n⏱️ 视觉提取耗时: ${duration}s`;
      
      // 保存最后一次的结果
      if (i === loopCount - 1) {
        extractedStyle.value = style;
      }
      
      extractStreamContent.value += `\n\n✅ 第 ${i + 1} 次提取完成！`;
    }
  } catch (error) {
    console.error('提取样式出错:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    extractStreamContent.value += `\n\n❌ 提取失败: ${errMsg}`;
    alert('提取样式失败: ' + errMsg);
  } finally {
    isExtracting.value = false;
    currentStage.value = '';
  }
}

// 阶段二：仅生成结果（可以单独使用）
async function handleGenerateOnly() {
  // 如果阶段二有提示词，不需要检查阶段一的输出
  const hasStage2Prompt = generateSystemPrompt.value.trim() || generateUserPrompt.value.trim();
  
  // 如果没有阶段一的输出且没有阶段二的提示词，使用默认样式描述
  if (!extractedStyle.value && !hasStage2Prompt) {
    // 允许单独使用阶段二，使用默认样式描述
    console.warn('未检测到阶段一的输出，将使用默认样式描述');
  }

  isGenerating.value = true;
  currentStage.value = 'generating';
  result.value = null;
  generateStreamContent.value = '';
  generateFinalPrompt.value = '';

  // 根据输出类型设置不同的宽高
  // HTML: 1280x720, 图片: 3600x2025
  const width = outputType.value === 'html' ? 1280 : 3600;
  const height = outputType.value === 'html' ? 720 : 2025;

  // 如果选择了发送图片，准备图片的 base64 数组
  let imageBase64s: string[] | undefined = undefined;
  if (sendImagesToStage2.value && imageFiles.value.length > 0) {
    imageBase64s = await Promise.all(
      imageFiles.value.map((file: File) => fileToBase64(file))
    );
  }

  const startTime = Date.now();

  try {
    // 如果选择了HTML模板，确保模板已加载
    if (outputType.value === 'html') {
      await ensureTemplateLoaded();
    }
    
    const htmlTemplate = outputType.value === 'html' ? getHtmlTemplate() : undefined;
    console.log('生成时使用的HTML模板:', htmlTemplate ? `已提供，长度: ${htmlTemplate.length}` : '未提供');
    
    const generateResult = await generateSlide(
      {
        styleDescription: extractedStyle.value?.styleDescription || '请根据用户需求生成一张高质量的幻灯片。',
        systemPrompt: generateSystemPrompt.value.trim() || undefined,
        userPrompt: generateUserPrompt.value.trim() || undefined,
        // imageBase64s: imageBase64s, // 单页生成也不传原图，避免干扰模型
        model: outputType.value === 'html' 
          ? (selectedHtmlModel.value || selectedModel.value || undefined)
          : undefined,
        imageModel: outputType.value === 'image' ? (selectedImageModel.value || undefined) : undefined,
        outputType: outputType.value,
        imageSize: outputType.value === 'image' ? imageSize.value : undefined,
        width: width,
        height: height,
        htmlTemplate: htmlTemplate,
      },
      {
        onStreamContent(content) {
          generateStreamContent.value = content;
        },
        onError(error) {
          console.error('生成失败:', error);
          generateStreamContent.value += `\n\n❌ 错误: ${error}`;
        },
        onComplete() {
          generateStreamContent.value += `\n\n✅ 生成完成！`;
        },
        onPromptReady(prompt) {
          generateFinalPrompt.value = prompt;
        },
      }
    );
    result.value = generateResult;

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    if (outputType.value === 'html') {
        generateStreamContent.value += `\n\n⏱️ HTML生成耗时: ${duration}s`;
    } else {
        generateStreamContent.value += `\n\n⏱️ 图片生成耗时: ${duration}s`;
    }

    if (generateResult.success) {
      generateStreamContent.value += '\n\n✅ 生成完成！';
    } else {
      generateStreamContent.value += `\n\n❌ 生成失败`;
    }
  } catch (error) {
    console.error('生成出错:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    result.value = {
      success: false,
      error: errMsg,
    };
    generateStreamContent.value += `\n\n❌ 生成失败: ${errMsg}`;
  } finally {
    isGenerating.value = false;
  }
}

// 一键生成：先执行第一阶段，然后自动执行第二阶段
async function handleGenerateAll() {
  if (imageFiles.value.length === 0) return;

  // 重置状态
  isExtracting.value = true;
  isGenerating.value = false;
  currentStage.value = 'extracting';
  extractedStyle.value = null;
  result.value = null;
  extractStreamContent.value = '';
  generateStreamContent.value = '';
  extractFinalPrompt.value = '';
  generateFinalPrompt.value = '';

  // 默认样式描述（如果第一阶段失败则使用）
  let styleDescription = '请根据用户需求生成一张高质量的幻灯片。';

  // 第一阶段：提取样式（不检验错误，失败也继续）
  try {
    // 将多张图片转换为 base64 数组
    const imageBase64s = await Promise.all(
      imageFiles.value.map((file: File) => fileToBase64(file))
    );
    
    const style = await extractStyleFromImage(
      {
        imageBase64s: imageBase64s,
        systemPrompt: extractSystemPrompt.value.trim() || undefined,
        userPrompt: extractUserInput.value.trim() || undefined,
        model: selectedModel.value || undefined,
      },
      {
        onStreamContent(content) {
          extractStreamContent.value = content;
        },
        onError(error) {
          console.error('提取样式失败:', error);
          extractStreamContent.value += `\n\n⚠️ 警告: ${error}（将继续执行第二阶段）`;
        },
        onPromptReady(prompt) {
          extractFinalPrompt.value = prompt;
        },
      }
    );
    extractedStyle.value = style;
    styleDescription = style.styleDescription;
    extractStreamContent.value += `\n\n✅ 提取完成！`;
  } catch (error) {
    console.error('提取样式出错:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    extractStreamContent.value += `\n\n⚠️ 提取失败: ${errMsg}（将继续执行第二阶段）`;
    // 不抛出错误，继续执行第二阶段
  } finally {
    isExtracting.value = false;
  }

  // 第二阶段：生成结果
  isGenerating.value = true;
  currentStage.value = 'generating';
  const startTime = Date.now();

      // 根据输出类型设置不同的宽高
      // HTML: 1280x720, 图片: 3600x2025
      const width = outputType.value === 'html' ? 1280 : 3600;
      const height = outputType.value === 'html' ? 720 : 2025;

      // 准备图片的 base64 数组 (仅图片生成模式且有参考图时)
      let imageBase64s: string[] | undefined = undefined;
      if (outputType.value === 'image' && refImageFiles.value.length > 0) {
        imageBase64s = await Promise.all(
          refImageFiles.value.map((file: File) => fileToBase64(file))
        );
      }

      try {
        // 如果选择了HTML模板，确保模板已加载
        if (outputType.value === 'html') {
          await ensureTemplateLoaded();
        }
        
        const htmlTemplate = outputType.value === 'html' ? getHtmlTemplate() : undefined;
        console.log('生成时使用的HTML模板:', htmlTemplate ? `已提供，长度: ${htmlTemplate.length}` : '未提供');
        
        const generateResult = await generateSlide(
          {
            styleDescription: styleDescription, // 使用提取的样式描述，如果失败则使用默认
            systemPrompt: generateSystemPrompt.value.trim() || undefined,
            userPrompt: generateUserPrompt.value.trim() || undefined,
            imageBase64s: imageBase64s,
        model: outputType.value === 'html' 
          ? (selectedHtmlModel.value || selectedModel.value || undefined)
          : undefined,
        imageModel: outputType.value === 'image' ? (selectedImageModel.value || undefined) : undefined,
        outputType: outputType.value,
        imageSize: outputType.value === 'image' ? imageSize.value : undefined,
        width: width,
        height: height,
        htmlTemplate: htmlTemplate,
      },
      {
        onStreamContent(content) {
          generateStreamContent.value = content;
        },
        onError(error) {
          console.error('生成失败:', error);
          generateStreamContent.value += `\n\n❌ 错误: ${error}`;
        },
        onComplete() {
          generateStreamContent.value += `\n\n✅ 生成完成！`;
        },
        onPromptReady(prompt) {
          generateFinalPrompt.value = prompt;
        },
      }
    );
    result.value = generateResult;

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    if (outputType.value === 'html') {
        generateStreamContent.value += `\n\n⏱️ HTML生成耗时: ${duration}s`;
    } else {
        generateStreamContent.value += `\n\n⏱️ 图片生成耗时: ${duration}s`;
    }

    if (generateResult.success) {
      generateStreamContent.value += '\n\n✅ 生成完成！';
    } else {
      generateStreamContent.value += `\n\n❌ 生成失败`;
    }
  } catch (error) {
    console.error('生成出错:', error);
    const errMsg = error instanceof Error ? error.message : String(error);
    result.value = {
      success: false,
      error: errMsg,
    };
    generateStreamContent.value += `\n\n❌ 生成失败: ${errMsg}`;
  } finally {
    isGenerating.value = false;
    currentStage.value = '';
  }
}

// 阶段三：样式对比审计
async function handleAudit() {
  if (!result.value) return;
  if (imagePreviews.value.length === 0) {
    alert('需要原始参考图片进行对比');
    return;
  }
  
  isAuditing.value = true;
  currentStage.value = 'auditing';
  auditResult.value = null;
  
  console.log('开始样式对比...');
  
  try {
    const originalImage = imagePreviews.value[0]; // 使用第一张参考图作为基准
    let generatedImage = '';
    
    if (outputType.value === 'image' && result.value.imageUrl) {
        console.log('使用生成的图片进行对比');
        generatedImage = result.value.imageUrl;
    } else if (outputType.value === 'html' && result.value.html) {
        console.log('准备截取 HTML 预览...');
        // 对于 HTML，尝试从 iframe 截图
            // 使用 ref 获取 iframe 元素，更可靠
        let iframe: HTMLIFrameElement | null = null;
        if (htmlPreviewWrapper.value) {
            iframe = htmlPreviewWrapper.value.querySelector('iframe');
        } else {
            iframe = document.querySelector('.preview-iframe');
        }

        if (iframe) {
             // 检查 iframe 是否加载完成
             if (!iframe.contentDocument || iframe.contentDocument.readyState !== 'complete') {
                console.log('iframe 尚未加载完成，等待中...');
                await new Promise(resolve => {
                    iframe!.onload = resolve;
                    // 超时保护
                    setTimeout(resolve, 3000);
                });
             }

             if (iframe.contentWindow && iframe.contentDocument) {
                 try {
                    console.log('调用 html2canvas...', { 
                        bodyWidth: iframe.contentDocument.body.scrollWidth,
                        bodyHeight: iframe.contentDocument.body.scrollHeight
                    });
                    
                    const canvas = await html2canvas(iframe.contentDocument.body, {
                        width: 1280,
                        height: 720,
                        useCORS: true, // 允许跨域图片
                        logging: true,  // 开启日志以便调试
                        allowTaint: true, // 允许被污染
                        window: iframe.contentWindow, // 指定 iframe 的 window 上下文
                        x: 0,
                        y: 0,
                        scale: 1, // 强制 1:1 截图
                        backgroundColor: '#ffffff' // 确保有背景色
                    } as any);
                    
                    generatedImage = canvas.toDataURL('image/png');
                    console.log('截图成功，数据长度:', generatedImage.length);
                 } catch (e) {
                     console.error('截图失败:', e);
                     alert('无法截取HTML预览进行对比，请检查是否跨域或稍后重试');
                     throw e;
                 }
             } else {
                 throw new Error('无法访问 iframe 内容 (可能受同源策略限制)');
             }
        } else {
            console.error('找不到HTML预览元素或内容未加载');
            alert('找不到HTML预览元素，无法进行对比');
            throw new Error('Preview element not found');
        }
    } else {
        alert('没有生成结果可供对比');
        return;
    }
    
    if (!generatedImage || generatedImage.length < 100) {
        throw new Error('生成的图像数据无效或为空');
    }
    
    console.log('调用审计服务...');
    const res = await performPPTAudit(originalImage, generatedImage, selectedModel.value);
    console.log('审计完成:', res);
    auditResult.value = res;
    
  } catch (error) {
    console.error('样式对比失败:', error);
    alert(`样式对比失败: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    isAuditing.value = false;
  }
}

// 下载 HTML
function downloadHtml() {
  if (!result.value?.html) return;
  const blob = new Blob([result.value.html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `slide-${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 下载图片
function downloadImage() {
  if (!result.value?.imageUrl) return;
  const a = document.createElement('a');
  a.href = result.value.imageUrl;
  a.download = `slide-${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 复制到剪贴板（静默复制，不弹提示）
async function copyToClipboard(text: string) {
  if (!text || text.trim() === '') {
    return;
  }
  
  try {
    // 使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // 降级方案：使用 execCommand
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('复制失败:', err);
      }
      
      document.body.removeChild(textarea);
    }
  } catch (err) {
    console.error('复制失败:', err);
  }
}

// 辅助函数
function getScoreColor(score: number) {
  if (score >= 90) return '#10b981';
  if (score >= 70) return '#f59e0b';
  return '#ef4444';
}

function getScoreCircleStyle(score: number) {
  return {
    background: `conic-gradient(var(--accent-color) ${score * 3.6}deg, #e2e8f0 0deg)`
  };
}

// 触发Excel文件选择
function triggerExcelSelect() {
  excelInput.value?.click();
}

// 触发图片文件夹选择
function triggerImageFolderSelect() {
  imageFolderInput.value?.click();
}

// 处理模板选择
async function handleTemplateSelect() {
  if (!selectedHtmlTemplateId.value) {
    selectedHtmlTemplateContent.value = '';
    isTemplateLoading.value = false;
    return;
  }
  
  const template = htmlTemplates.value.find((t: typeof HTML_TEMPLATES[0]) => t.id === selectedHtmlTemplateId.value);
  if (!template) {
    isTemplateLoading.value = false;
    return;
  }
  
  isTemplateLoading.value = true;
  try {
    // 将原始URL转换为代理路径
    // 例如: https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/template/template_9.html
    // 转换为: /html-template-proxy/html-slides/static/template/template_9.html
    let templateUrl = template.html_url;
    if (templateUrl.startsWith('https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com')) {
      templateUrl = templateUrl.replace('https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com', '/html-template-proxy');
    }
    
    console.log('开始加载HTML模板，原始URL:', template.html_url);
    console.log('使用代理URL:', templateUrl);
    const response = await fetch(templateUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const htmlContent = await response.text();
    selectedHtmlTemplateContent.value = htmlContent;
    console.log('HTML模板加载成功，长度:', htmlContent.length);
    console.log('模板内容预览（前200字符）:', htmlContent.substring(0, 200));
  } catch (error) {
    console.error('加载HTML模板失败:', error);
    selectedHtmlTemplateContent.value = '';
    alert(`加载HTML模板失败: ${error instanceof Error ? error.message : String(error)}\n请检查网络连接或模板URL是否可访问。`);
  } finally {
    isTemplateLoading.value = false;
  }
}

// 确保模板已加载（如果选择了模板但还没加载，则等待加载）
async function ensureTemplateLoaded(): Promise<boolean> {
  if (!selectedHtmlTemplateId.value || useCustomHtmlTemplate.value) {
    return true; // 没有选择模板或使用自定义模板，不需要等待
  }
  
  if (selectedHtmlTemplateContent.value) {
    return true; // 模板已加载
  }
  
  // 模板未加载，尝试加载
  console.log('模板未加载，开始加载...');
  await handleTemplateSelect();
  return !!selectedHtmlTemplateContent.value;
}

// 获取选中的模板信息
function getSelectedTemplateInfo(): string {
  if (!selectedHtmlTemplateId.value) return '';
  const template = htmlTemplates.value.find((t: typeof HTML_TEMPLATES[0]) => t.id === selectedHtmlTemplateId.value);
  if (!template) return '';
  return `${template.label.logical_relation} - ${template.label.chart_type}`;
}

// 获取选中的模板URL
function getSelectedTemplateUrl(): string {
  if (!selectedHtmlTemplateId.value) return '';
  const template = htmlTemplates.value.find((t: typeof HTML_TEMPLATES[0]) => t.id === selectedHtmlTemplateId.value);
  return template?.html_url || '';
}

// 获取要使用的HTML模板内容
function getHtmlTemplate(): string | undefined {
  if (useCustomHtmlTemplate.value && customHtmlTemplate.value.trim()) {
    console.log('使用自定义HTML模板，长度:', customHtmlTemplate.value.trim().length);
    return customHtmlTemplate.value.trim();
  }
  if (selectedHtmlTemplateId.value && selectedHtmlTemplateContent.value) {
    console.log('使用预设HTML模板，ID:', selectedHtmlTemplateId.value, '长度:', selectedHtmlTemplateContent.value.length);
    return selectedHtmlTemplateContent.value;
  }
  if (selectedHtmlTemplateId.value && !selectedHtmlTemplateContent.value) {
    console.warn('警告: 已选择模板但内容为空，模板ID:', selectedHtmlTemplateId.value);
  }
  console.log('未使用HTML模板');
  return undefined;
}

// 处理图片文件夹选择
function handleImageFolderSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;

  imageFolderFiles.value.clear();
  
  // 将所有文件存储到Map中，以文件名为key
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // 使用文件名（不包含路径）作为key
    const fileName = file.name.toLowerCase();
    imageFolderFiles.value.set(fileName, file);
  }
  
  testLog.value = `已选择图片文件夹，包含 ${imageFolderFiles.value.size} 个文件\n`;
}

// 处理Excel文件选择
async function handleExcelSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  excelFile.value = file;
  testLog.value = `已选择Excel文件: ${file.name}\n`;

  try {
    // 使用FileReader读取文件，避免大文件堆栈溢出
    const reader = new FileReader();
    
    await new Promise<void>((resolve, reject) => {
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error('文件读取失败'));
            return;
          }
          
          // 读取XLSX格式（用于数据读取）
          workbook.value = XLSX.read(data, { type: 'binary' });
          
          // 读取ExcelJS格式（用于图片插入和写入）
          const arrayBuffer = await file.arrayBuffer();
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(arrayBuffer);
          exceljsWorkbook.value = wb;
          
          testLog.value += `Excel文件加载成功\n`;
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      
      reader.readAsBinaryString(file);
    });
  } catch (error) {
    testLog.value += `加载Excel文件失败: ${error}\n`;
    console.error('加载Excel文件失败:', error);
  }
}

// 查找列索引
function findColumnIndex(sheet: XLSX.WorkSheet, columnName: string): number | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  for (let col = 0; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = sheet[cellAddress];
    if (cell && cell.v && String(cell.v).trim() === columnName) {
      return col;
    }
  }
  return null;
}

// HTML转PNG
async function htmlToPng(html: string): Promise<string> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;left:-9999px;width:1280px;height:720px;border:none;';
  iframe.sandbox.add('allow-same-origin', 'allow-scripts');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('无法创建iframe文档');

    doc.open();
    doc.write(html);
    doc.close();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const canvas = await html2canvas(iframe.contentDocument!.body, {
      width: 1280,
      height: 720,
      scale: 1,
      useCORS: true,
      logging: false,
    } as any);

    return canvas.toDataURL('image/png');
  } finally {
    document.body.removeChild(iframe);
  }
}

// 将PNG插入Excel
async function insertPngToExcel(row: number, col: number, pngBase64: string): Promise<void> {
  if (!exceljsWorkbook.value) {
    testLog.value += `✗ 插入图片失败: exceljsWorkbook为空\n`;
    return;
  }

  try {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (!worksheet) {
      testLog.value += `✗ 插入图片失败: worksheet为空\n`;
      return;
    }

    testLog.value += `正在处理图片数据...\n`;
    
    // 处理base64数据（支持不同的格式）
    let base64Data = pngBase64;
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    } else if (base64Data.startsWith('data:image')) {
      base64Data = base64Data.replace(/^data:image\/[^;]+;base64,/, '');
    }
    
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    testLog.value += `图片数据已转换，大小: ${bytes.length} 字节\n`;

    const imageId = exceljsWorkbook.value.addImage({
      buffer: bytes.buffer,
      extension: 'png',
    });

    testLog.value += `图片已添加到workbook，imageId: ${imageId}\n`;

    // 设置行高和列宽
    worksheet.getRow(row + 1).height = 120;
    worksheet.getColumn(col + 1).width = 20;

    // 插入图片
    worksheet.addImage(imageId, {
      tl: { col: col, row: row },
      ext: { width: 256, height: 144 },
    });

    testLog.value += `✓ 图片已插入到Excel (行${row + 1}, 列${col + 1})\n`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    testLog.value += `✗ 插入图片失败: ${errMsg}\n`;
    console.error('插入图片失败:', error);
  }
}

// 写入文本到Excel
function writeTextToExcel(row: number, col: number, value: string) {
  if (workbook.value) {
    const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]];
    const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
    sheet[cellAddress] = { t: 's', v: value };
  }
  
  if (exceljsWorkbook.value) {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (worksheet) {
      const cell = worksheet.getCell(row + 1, col + 1);
      cell.value = value;
    }
  }
}

// 导出Excel
async function exportExcel() {
  if (!exceljsWorkbook.value) {
    alert('没有可导出的Excel数据');
    return;
  }

  try {
    const buffer = await exceljsWorkbook.value.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = excelFile.value
      ? excelFile.value.name.replace(/\.(xlsx|xls)$/i, '_测试结果.xlsx')
      : '测试结果.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    testLog.value += `\nExcel文件已导出\n`;
  } catch (error) {
    testLog.value += `\n导出Excel失败: ${error}\n`;
    console.error('导出Excel失败:', error);
  }
}

// 通过图片ID提取图片
async function extractImageById(imageId: string): Promise<string | null> {
  if (!exceljsWorkbook.value) {
    console.log('extractImageById: exceljsWorkbook为空');
    return null;
  }
  
  try {
    console.log(`尝试通过ID提取图片: ${imageId}`);
    
    // 方法1: 直接使用字符串ID
    let imageData = null;
    try {
      imageData = exceljsWorkbook.value.getImage(imageId);
      console.log(`方法1: 直接使用字符串ID，结果:`, imageData ? '成功' : '失败');
    } catch (e) {
      console.log(`方法1失败:`, e);
    }
    
    // 方法2: 尝试作为数字ID（如果ID是数字字符串）
    if (!imageData && /^\d+$/.test(imageId)) {
      try {
        imageData = exceljsWorkbook.value.getImage(parseInt(imageId));
        console.log(`方法2: 作为数字ID，结果:`, imageData ? '成功' : '失败');
      } catch (e) {
        console.log(`方法2失败:`, e);
      }
    }
    
    // 方法3: 尝试从workbook.model.media中查找
    if (!imageData) {
      try {
        const workbookModel = (exceljsWorkbook.value as any).model;
        if (workbookModel && workbookModel.media) {
          // 遍历所有媒体，查找匹配的ID
          for (const [mediaId, mediaData] of Object.entries(workbookModel.media)) {
            if (String(mediaId) === imageId || mediaId === imageId) {
              imageData = mediaData;
              console.log(`方法3: 从model.media中找到，ID: ${mediaId}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`方法3失败:`, e);
      }
    }
    
    // 方法4: 尝试从所有图片中查找匹配的ID
    if (!imageData) {
      try {
        const worksheet = exceljsWorkbook.value.worksheets[0];
        if (worksheet) {
          const images = worksheet.getImages();
          for (const image of images) {
            const imgId = String(image.imageId || '');
            if (imgId === imageId || imgId.includes(imageId) || imageId.includes(imgId)) {
              imageData = exceljsWorkbook.value.getImage(image.imageId);
              console.log(`方法4: 从getImages中找到匹配，imageId: ${image.imageId}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log(`方法4失败:`, e);
      }
    }
    
    if (imageData && imageData.buffer) {
      const buffer = imageData.buffer;
      const ext = imageData.extension || 'png';
      
      console.log(`图片数据获取成功: 扩展名=${ext}, buffer类型=${buffer.constructor.name}`);
      
      const mimeType = ext === 'png' ? 'image/png' : 
                      ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : 
                      ext === 'gif' ? 'image/gif' :
                      'image/png';
      
      // 将buffer转换为Uint8Array
      let uint8Array: Uint8Array;
      if (buffer instanceof Uint8Array) {
        uint8Array = buffer;
      } else if (buffer instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(buffer);
      } else if ((buffer as any).buffer instanceof ArrayBuffer) {
        // 可能是TypedArray
        uint8Array = new Uint8Array((buffer as any).buffer);
      } else {
        try {
          uint8Array = new Uint8Array(buffer as any);
        } catch (e) {
          console.error('无法转换buffer:', e, buffer);
          return null;
        }
      }
      
      console.log(`Uint8Array长度: ${uint8Array.length}`);
      
      // 创建Blob并转换为base64
      const blob = new Blob([uint8Array], { type: mimeType });
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          console.log(`Base64转换成功，长度: ${result.length}, 前缀: ${result.substring(0, 50)}`);
          resolve(result);
        };
        reader.onerror = (error) => {
          console.error('FileReader错误:', error);
          reject(error);
        };
        reader.readAsDataURL(blob);
      });
      
      return base64;
    } else {
      console.log(`未找到图片数据，imageData:`, imageData);
    }
  } catch (error) {
    console.error(`通过ID ${imageId} 提取图片失败:`, error);
  }
  
  return null;
}

// 从Excel中提取指定行的图片（使用ExcelJS的getImages API）
async function extractImageFromExcelRow(row: number, col: number): Promise<string | null> {
  if (!exceljsWorkbook.value) {
    console.log('exceljsWorkbook为空');
    return null;
  }
  
  try {
    const worksheet = exceljsWorkbook.value.worksheets[0];
    if (!worksheet) {
      console.log('worksheet为空');
      return null;
    }
    
    // 使用ExcelJS的getImages()方法获取所有图片
    const images = worksheet.getImages();
    console.log(`找到 ${images.length} 张图片，查找行${row}列${col}的图片`);
    
    // 遍历所有图片，找到目标单元格的图片
    for (const image of images) {
      if (image && image.range && image.range.tl) {
        // ExcelJS 的 tl (TopLeft) 通常包含 nativeRow/nativeCol (0-based)
        // 或者是 row/col (可能包含偏移的小数)
        // 我们这里主要关注整数部分
        const imageRow = Math.floor(image.range.tl.nativeRow ?? image.range.tl.row);
        const imageCol = Math.floor(image.range.tl.nativeCol ?? image.range.tl.col);
        
        console.log(`[调试] 发现图片: ID=${image.imageId}, 位置=(${imageRow}, ${imageCol}), 目标=(${row}, ${col})`);
        
        // 检查图片是否在目标单元格
        // 1. 精确匹配
        if (imageRow === row && imageCol === col) {
          console.log(`[调试] -> 精确匹配成功`);
          return await processImageData(image);
        }
        
        // 2. 容错匹配：如果在同一行，且列相差不大（比如图片稍微放偏了）
        // 或者是浮动图片导致行稍微偏了一点点（虽然取了 floor 应该好了）
        if (imageRow === row && Math.abs(imageCol - col) <= 1) {
           console.log(`[调试] -> 模糊匹配成功 (列偏差)`);
           return await processImageData(image);
        }
      }
    }
    
    console.log('[调试] 未找到匹配的图片');
  } catch (error) {
    console.error('从Excel提取图片失败:', error);
  }
  
  return null;
}

// 辅助函数：处理图片数据
async function processImageData(image: any): Promise<string | null> {
    if (!exceljsWorkbook.value) return null;
    
    const imageId = image.imageId;
    const imageData = exceljsWorkbook.value.getImage(imageId);
    
    if (imageData && imageData.buffer) {
        // 获取图片的二进制数据和扩展名
        const buffer = imageData.buffer;
        const ext = imageData.extension || 'png';
        
        // 确定MIME类型
        const mimeType = ext === 'png' ? 'image/png' : 
                        ext === 'jpeg' || ext === 'jpg' ? 'image/jpeg' : 
                        ext === 'gif' ? 'image/gif' :
                        'image/png';
        
        // 将buffer转换为Uint8Array
        let uint8Array: Uint8Array;
        if (buffer instanceof Uint8Array) {
            uint8Array = buffer;
        } else if (buffer instanceof ArrayBuffer) {
            uint8Array = new Uint8Array(buffer);
        } else {
            try {
                uint8Array = new Uint8Array(buffer as any);
            } catch (e) {
                console.error('无法转换buffer:', e);
                return null;
            }
        }
        
        // 创建Blob并转换为base64
        const blob = new Blob([uint8Array], { type: mimeType });
        const reader = new FileReader();
        return await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(blob);
        });
    }
    return null;
}

// 批量运行预览
function viewBatchHtml(html: string) {
  batchPreviewHtml.value = html;
  batchPreviewImage.value = '';
  showBatchPreview.value = true;
}

function viewBatchImage(url: string) {
  batchPreviewHtml.value = '';
  batchPreviewImage.value = url;
  showBatchPreview.value = true;
}

// 开始测试
async function handleStartTest() {
  if (!excelFile.value || !workbook.value || !exceljsWorkbook.value) {
    alert('请先选择Excel文件');
    return;
  }

  isTesting.value = true;
  shouldStopTest.value = false;
  testLog.value = '开始批量运行...\n';
  batchResultsList.value = []; // 清空之前的列表

  try {
    const sheet = workbook.value.Sheets[workbook.value.SheetNames[0]];
    if (!sheet) {
      throw new Error('Excel文件中没有找到工作表');
    }

    // 查找列索引
    const bodyPageCol = findColumnIndex(sheet, '正文页');
    const themeCol = findColumnIndex(sheet, '主题');
    const extractModelCol = findColumnIndex(sheet, '风格提取模型');
    const extractTextCol = findColumnIndex(sheet, '风格提取文本');
    let extractTimeCol = findColumnIndex(sheet, '视觉提取耗时');
    const htmlModelCol = findColumnIndex(sheet, 'html使用模型');
    const htmlImageCol = findColumnIndex(sheet, 'html生成');
    let htmlTimeCol = findColumnIndex(sheet, 'HTML生成耗时');
    const htmlSourceCol = findColumnIndex(sheet, 'html源码');
    const imageModelCol = findColumnIndex(sheet, '图片使用模型');
    const imageGenCol = findColumnIndex(sheet, '图片生成');

    // 自动添加缺失的时间列
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    let nextCol = range.e.c + 1;

    if (extractTimeCol === null) {
      extractTimeCol = nextCol++;
      writeTextToExcel(0, extractTimeCol, '视觉提取耗时');
    }
    if (htmlTimeCol === null) {
      htmlTimeCol = nextCol++;
      writeTextToExcel(0, htmlTimeCol, 'HTML生成耗时');
    }

    if (bodyPageCol === null || themeCol === null) {
      throw new Error('Excel文件中未找到"正文页"或"主题"列');
    }

    // 获取数据范围，遍历所有行
    // const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1'); // range已在上面定义
    const totalRows = range.e.r;
    
    testLog.value += `找到 ${totalRows} 行数据，开始遍历处理...\n\n`;
    
    // 强制使用指定的模型
    const batchExtractModel = 'doubao-seed-1.8';
    const batchHtmlModel = 'doubao-seed-1.8';
    const batchImageModel = 'Doubao-image-seedream-v4.5';

    // 遍历每一行（从第1行开始，第0行是表头）
    for (let rowIndex = 1; rowIndex <= totalRows; rowIndex++) {
      // 检查是否请求停止
      if (shouldStopTest.value) {
        testLog.value += `\n⚠️ 测试已停止，正在导出Excel...\n`;
        await exportExcel();
        testLog.value += `✓ Excel已导出\n`;
        break;
      }
      
      const bodyPageCell = XLSX.utils.encode_cell({ r: rowIndex, c: bodyPageCol });
      const themeCell = XLSX.utils.encode_cell({ r: rowIndex, c: themeCol });

      const bodyPageValue = sheet[bodyPageCell]?.v;
      const themeValue = sheet[themeCell]?.v;

      // 跳过没有图片的行
      if (!bodyPageValue) {
        // 如果单元格为空，但我们还不知道是否有浮动图片，所以不能直接跳过
        // 我们会在下面尝试提取浮动图片
      }

      // 添加到结果列表
      const resultItem = {
        id: rowIndex,
        status: 'pending' as const,
        step: 'idle' as const,
        theme: themeValue || '无主题',
        imageName: bodyPageValue ? String(bodyPageValue).split(/[/\\]/).pop() : '尝试提取图片...',
        showStyle: false, // 默认收起
      };
      batchResultsList.value.push(resultItem);
      
      // 更新状态为处理中
      resultItem.status = 'processing';
      resultItem.step = 'extracting';

      testLog.value += `\n========== 处理第 ${rowIndex} 行 ==========\n`;
      
      // 重试机制：最多重试3次
      const maxRetries = 3;
      let retryCount = 0;
      let rowSuccess = false;
      
      while (retryCount < maxRetries && !rowSuccess) {
        if (shouldStopTest.value) break;
        
        if (retryCount > 0) {
          testLog.value += `\n[重试 ${retryCount}/${maxRetries}] 重新处理第 ${rowIndex} 行...\n`;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
        
        try {
          // 处理图片：从文件路径或文件名读取图片
          let imageBase64s: string[] = [];
          
          // 优先尝试从单元格位置提取浮动图片 (exceljs)
          testLog.value += `尝试提取浮动图片 (行${rowIndex}, 列${bodyPageCol})...\n`;
          // 打印到日志以便用户也能看到调试信息
          console.log(`正在查找第 ${rowIndex} 行，第 ${bodyPageCol} 列的图片...`);
          const floatingImage = await extractImageFromExcelRow(rowIndex, bodyPageCol);
          if (floatingImage) {
            imageBase64s = [floatingImage];
            testLog.value += `✓ 成功提取浮动图片 (Base64长度: ${floatingImage.length})\n`;
            if (!resultItem.imageName || resultItem.imageName === '尝试提取图片...') {
              resultItem.imageName = '浮动图片';
            }
          } else {
             testLog.value += `未找到浮动图片\n`;
          }
      
      // 如果没有浮动图片，尝试从单元格内容解析
      if (imageBase64s.length === 0 && typeof bodyPageValue === 'string' && bodyPageValue.trim()) {
        const imagePathOrName = bodyPageValue.trim();
        
        // 检查是否是 WPS 的 DISPIMG 公式
        if (imagePathOrName.startsWith('=DISPIMG')) {
           // 尝试解析 ID (碰碰运气，可能 exceljs 加载到了 media 中)
           const match = imagePathOrName.match(/DISPIMG\("([^"]+)"/);
           if (match && match[1]) {
             const id = match[1];
             testLog.value += `检测到WPS嵌入图片公式，尝试通过ID提取: ${id}\n`;
             const base64 = await extractImageById(id);
             if (base64) {
               imageBase64s = [base64];
               testLog.value += `✓ 成功通过ID提取图片\n`;
             } else {
               throw new Error(`无法提取WPS嵌入图片 (${id})。请改用“插入->图片”添加浮动图片，或将图片导出文件后填写路径。`);
             }
           } else {
             throw new Error(`无法读取WPS嵌入图片公式: ${imagePathOrName}。请改用标准浮动图片。`);
           }
        } else {
            let imageFile: File | null = null;
            
            // 方法1: 如果选择了图片文件夹，尝试从文件夹中查找
            if (imageFolderFiles.value.size > 0) {
              const fileName = imagePathOrName.split(/[/\\]/).pop() || imagePathOrName;
              const fileNameLower = fileName.toLowerCase();
              
              imageFile = imageFolderFiles.value.get(fileNameLower) || null;
              
              if (!imageFile) {
                for (const [key, file] of imageFolderFiles.value.entries()) {
                  if (key === fileNameLower || key.includes(fileNameLower) || fileNameLower.includes(key)) {
                    imageFile = file;
                    break;
                  }
                }
              }
            }
            
              if (imageFile) {
                const base64 = await fileToBase64(imageFile);
                imageBase64s = [base64];
              } 
              else if (imagePathOrName.startsWith('http://') || imagePathOrName.startsWith('https://')) {
                const response = await fetch(imagePathOrName);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const reader = new FileReader();
                const base64 = await new Promise<string>((resolve, reject) => {
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(blob);
                });
                imageBase64s = [base64];
              } 
              else if (imagePathOrName.startsWith('data:image')) {
                imageBase64s = [imagePathOrName];
              } 
              else {
                // 尝试直接作为base64
                // 如果长度不够，可能是路径但没找到文件
                if (imagePathOrName.length > 200) { // 简单判断是否可能是base64
                   // 补全前缀尝试
                   if (!imagePathOrName.startsWith('data:image')) {
                       imageBase64s = [`data:image/png;base64,${imagePathOrName}`];
                   } else {
                       imageBase64s = [imagePathOrName];
                   }
                } else {
                   throw new Error(`无法加载图片: ${imagePathOrName} (未在文件夹中找到)`);
                }
              }
          }
        }
      
          if (imageBase64s.length === 0) {
            // 如果单元格本身是空的，且没找到浮动图片，那么就真的跳过
            if (!bodyPageValue) {
                testLog.value += `第 ${rowIndex} 行无图片内容，跳过\n`;
                resultItem.status = 'skipped';
                break; // 跳出重试循环，处理下一行
            }
            throw new Error('无法获取图片 (未找到浮动图片或有效路径)');
          } else {
             // 保存提取到的图片用于展示
             resultItem.extractedImage = imageBase64s[0];
          }
          
          // 第一阶段：提取样式
          testLog.value += `开始提取样式...\n`;
          resultItem.step = 'extracting';
          
          let styleDescription = '';
          // 如果已有缓存的样式描述，直接使用（除非是手动重试且想强制刷新，但这里先复用）
          if (resultItem.styleDescription) {
             styleDescription = resultItem.styleDescription;
             testLog.value += `使用已提取的样式描述\n`;
          } else {
              const extractStartTime = Date.now();
              const styleResult = await extractStyleFromImage(
                {
                  imageBase64s: imageBase64s,
                  systemPrompt: undefined,
                  userPrompt: (themeValue as string) || undefined,
                  model: batchExtractModel,
                },
                {
                  onError(error) {
                    testLog.value += `提取错误: ${error}\n`;
                  },
                }
              );
              const extractDuration = ((Date.now() - extractStartTime) / 1000).toFixed(2);
              if (extractTimeCol !== null) writeTextToExcel(rowIndex, extractTimeCol, `${extractDuration}s`);
              
              styleDescription = styleResult.styleDescription;
              resultItem.styleDescription = styleDescription;
          }
          
          // 写入结果
          if (extractModelCol !== null) writeTextToExcel(rowIndex, extractModelCol, batchExtractModel);
          if (extractTextCol !== null) writeTextToExcel(rowIndex, extractTextCol, styleDescription);
          
          // 第二阶段：生成结果 (HTML 和 图片都生成)
          testLog.value += `开始生成 HTML...\n`;
          resultItem.step = 'generating_html';
          
          // HTML生成
          
          // 确保模板已加载
          if (selectedHtmlTemplateId.value) {
            await ensureTemplateLoaded();
          }
          const htmlTemplate = getHtmlTemplate();
          
          const htmlStartTime = Date.now();
          const htmlGenerateResult = await generateSlide(
            {
              styleDescription: styleDescription, // 明确传递样式描述
              systemPrompt: undefined,
              userPrompt: (themeValue as string) || undefined,
              model: batchHtmlModel,
              outputType: 'html',
              width: 1280,
              height: 720,
              htmlTemplate: htmlTemplate,
              // imageBase64s: imageBase64s, // 批量模式默认不传原图给生成阶段，仅使用提取的样式描述
            },
            {
              onError(error) { testLog.value += `HTML生成错误: ${error}\n`; }
            }
          );
          const htmlDuration = ((Date.now() - htmlStartTime) / 1000).toFixed(2);
          if (htmlTimeCol !== null) writeTextToExcel(rowIndex, htmlTimeCol, `${htmlDuration}s`);

          if (htmlGenerateResult.success && htmlGenerateResult.html) {
             resultItem.html = htmlGenerateResult.html;
             if (htmlModelCol !== null) writeTextToExcel(rowIndex, htmlModelCol, batchHtmlModel);
             if (htmlSourceCol !== null) writeTextToExcel(rowIndex, htmlSourceCol, htmlGenerateResult.html);
             
             // HTML转图片并插入Excel
             try {
                const pngBase64 = await htmlToPng(htmlGenerateResult.html);
                if (htmlImageCol !== null) await insertPngToExcel(rowIndex, htmlImageCol, pngBase64);
             } catch (e) {
                 console.error('HTML转图片失败', e);
             }
          }

          testLog.value += `开始生成 图片...\n`;
          resultItem.step = 'generating_image';
          
          // 图片生成
          const imgGenerateResult = await generateSlide(
              {
                styleDescription: styleDescription,
                systemPrompt: undefined,
                userPrompt: (themeValue as string) || undefined,
                imageModel: batchImageModel,
                outputType: 'image',
                imageSize: '1K',
                width: 3600,
                height: 2025,
                // imageBase64s: imageBase64s, // 批量模式默认不传原图给生成阶段
              },
              {
                onError(error) { testLog.value += `图片生成错误: ${error}\n`; }
              }
            );

            if (imgGenerateResult.success && imgGenerateResult.imageUrl) {
               resultItem.imageUrl = imgGenerateResult.imageUrl;
               if (imageModelCol !== null) writeTextToExcel(rowIndex, imageModelCol, batchImageModel);
               
               // 下载图片并插入Excel
               try {
                   const response = await fetch(imgGenerateResult.imageUrl);
                   const blob = await response.blob();
                   const reader = new FileReader();
                   const pngBase64 = await new Promise<string>((resolve) => {
                      reader.onload = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                   });
                   if (imageGenCol !== null) await insertPngToExcel(rowIndex, imageGenCol, pngBase64);
               } catch(e) {
                   console.error('图片下载失败', e);
               }
            }
          
          rowSuccess = true;
          resultItem.status = 'success';
          resultItem.step = 'completed';
          testLog.value += `✓ 第 ${rowIndex} 行处理完成\n`;
          
        } catch (error) {
          retryCount++;
          const errMsg = error instanceof Error ? error.message : String(error);
          testLog.value += `✗ 第 ${rowIndex} 行处理失败: ${errMsg}\n`;
          
          if (retryCount >= maxRetries) {
            resultItem.status = 'failed';
            resultItem.error = errMsg;
            break;
          }
        }
      }
    }

    if (!shouldStopTest.value) {
      await exportExcel();
      testLog.value += `✓ 测试完成！\n`;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    testLog.value += `\n测试失败: ${errMsg}\n`;
  } finally {
    isTesting.value = false;
    shouldStopTest.value = false;
  }
}

// 手动生成HTML
async function manualGenerateHtml(item: any) {
  if (item.status === 'processing') return;
  
  try {
    item.status = 'processing';
    item.error = undefined;
    
    // 1. 确保有样式描述
    if (!item.styleDescription) {
        item.step = 'extracting';
        testLog.value += `\n[手动] 正在为 #${item.id} 提取样式...\n`;
        const styleResult = await extractStyleFromImage(
            {
                imageBase64s: [item.extractedImage],
                userPrompt: item.theme || undefined,
                model: 'doubao-seed-1.8', // 默认使用
            },
            { onError: (e) => console.error(e) }
        );
        item.styleDescription = styleResult.styleDescription;
    }
    
    // 2. 生成HTML
    item.step = 'generating_html';
    testLog.value += `\n[手动] 正在为 #${item.id} 生成HTML...\n`;
    
    // 确保模板已加载
    if (selectedHtmlTemplateId.value) {
        await ensureTemplateLoaded();
    }
    const htmlTemplate = getHtmlTemplate();
    
    const htmlResult = await generateSlide(
        {
            styleDescription: item.styleDescription, // 明确传递样式描述
            userPrompt: item.theme || undefined,
            model: 'doubao-seed-1.8',
            outputType: 'html',
            width: 1280,
            height: 720,
            htmlTemplate: htmlTemplate,
            // imageBase64s: [item.extractedImage], // 手动模式也不传原图，保持一致
        },
        { onError: (e) => testLog.value += `HTML生成错误: ${e}\n` }
    );
    
    if (htmlResult.success && htmlResult.html) {
        item.html = htmlResult.html;
        testLog.value += `✓ #${item.id} HTML生成成功\n`;
        item.status = 'success';
    } else {
        throw new Error('HTML生成未返回结果');
    }
    
  } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      testLog.value += `✗ #${item.id} HTML生成失败: ${item.error}\n`;
  } finally {
      if (item.status === 'processing') item.status = 'success'; // 兜底
      item.step = 'completed';
  }
}

// 手动生成图片
async function manualGenerateImage(item: any) {
  if (item.status === 'processing') return;
  
  try {
    item.status = 'processing';
    item.error = undefined;

    // 1. 确保有样式描述
    if (!item.styleDescription) {
        item.step = 'extracting';
        testLog.value += `\n[手动] 正在为 #${item.id} 提取样式...\n`;
        const styleResult = await extractStyleFromImage(
            {
                imageBase64s: [item.extractedImage],
                userPrompt: item.theme || undefined,
                model: 'doubao-seed-1.8',
            },
            { onError: (e) => console.error(e) }
        );
        item.styleDescription = styleResult.styleDescription;
    }
    
    // 2. 生成图片
    item.step = 'generating_image';
    testLog.value += `\n[手动] 正在为 #${item.id} 生成图片...\n`;
    
    // 获取当前选择的图片模型，如果没有则默认
    let imgModel = 'Doubao-image-seedream-v4.5';
    if (imageModelList.value.length > 0 && selectedImageModel.value) {
        imgModel = selectedImageModel.value;
    }
    
    const imgResult = await generateSlide(
        {
            styleDescription: item.styleDescription,
            userPrompt: item.theme || undefined,
            imageModel: imgModel,
            outputType: 'image',
            imageSize: '1K',
            width: 3600,
            height: 2025,
            // imageBase64s: [item.extractedImage], // 手动模式也不传原图
        },
        { onError: (e) => testLog.value += `图片生成错误: ${e}\n` }
    );
    
    if (imgResult.success && imgResult.imageUrl) {
        item.imageUrl = imgResult.imageUrl;
        testLog.value += `✓ #${item.id} 图片生成成功\n`;
        item.status = 'success';
    } else {
        throw new Error('图片生成未返回结果');
    }
    
  } catch (error) {
      item.status = 'failed';
      item.error = error instanceof Error ? error.message : String(error);
      testLog.value += `✗ #${item.id} 图片生成失败: ${item.error}\n`;
  } finally {
      if (item.status === 'processing') item.status = 'success';
      item.step = 'completed';
  }
}

// 加载模型列表
onMounted(async () => {
  try {
    const models = await fetchModels();
    modelList.value = models;
    
    // 确保有 doubao-seed-1.8
    if (!modelList.value.find(m => m.id === 'doubao-seed-1.8')) {
      modelList.value.unshift({
        id: 'doubao-seed-1.8',
        object: 'model',
        created: Date.now(),
        owned_by: 'system'
      });
    }

    // 设置默认模型
    if (!selectedModel.value) {
      selectedModel.value = 'doubao-seed-1.8';
    }
    // HTML生成模型也默认使用
    if (!selectedHtmlModel.value) {
      selectedHtmlModel.value = 'doubao-seed-1.8';
    }
  } catch (error) {
    console.error('加载模型列表失败:', error);
  }

  // 加载图片生成模型列表（固定列表）
  isLoadingImageModels.value = true;
  try {
    const models = await fetchImageModels();
    imageModelList.value = models;
    // 设置默认模型为列表第一个
    if (models.length > 0 && !selectedImageModel.value) {
      selectedImageModel.value = models[0].id;
    }
  } catch (error) {
    console.error('加载图片生成模型列表失败:', error);
  } finally {
    isLoadingImageModels.value = false;
  }
});
</script>

<style scoped>
.keepstyle-panel {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--main-bg);
}

.panel-header {
  padding: 24px 32px;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.panel-header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
}

.panel-content {
  display: flex;
  flex-direction: column; /* 改为column以支持tabs header */
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs-header {
  display: flex;
  background: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 24px;
}

.tab-btn {
  padding: 16px 24px;
  background: transparent;
  border: none;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s;
}

.tab-btn:hover {
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.05);
}

.tab-btn.active {
  color: var(--accent-color);
  border-bottom-color: var(--accent-color);
}

.single-mode-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  height: 100%;
}

.left-panel {
  width: 400px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  background: var(--main-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.form-section {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
  padding: 24px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  gap: 16px;
}

.empty-icon {
  font-size: 3rem;
  opacity: 0.5;
}

.preview-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.stage-result {
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.stage-title {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 1.1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(0,0,0,0.02);
}

.result-display {
  padding: 0;
  background: #f8fafc;
  min-height: 400px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.html-preview-wrapper {
  width: 100%;
  aspect-ratio: 16 / 9;
  position: relative;
  overflow: hidden;
  background: #f8fafc;
  display: flex;
  justify-content: center;
  align-items: center;
}

.iframe-scale-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 1280px;
  height: 720px;
  transform-origin: center center;
  /* transform will be applied inline: translate(-50%, -50%) scale(...) */
  background: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.image-preview-wrapper {
  width: 100%;
  height: 100%;
  min-height: 500px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.preview-iframe {
  width: 100%;
  height: 720px; /* Fixed height for 16:9 aspect ratio context */
  border: none;
  background: white;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.preview-image {
  max-width: 100%;
  max-height: 600px;
  object-fit: contain;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.loading-placeholder {
  width: 100%;
  height: 100%;
  padding: 24px;
  display: flex;
}

.stream-content {
  width: 100%;
  height: 100%;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 16px;
  border-radius: 8px;
  font-family: 'Menlo', monospace;
  font-size: 0.85rem;
  overflow: auto;
  white-space: pre-wrap;
}

.result-actions {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  background: white;
}

.action-btn {
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  background: var(--accent-color);
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  filter: brightness(1.1);
}

.action-btn.secondary {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.action-btn.secondary:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.score-badge {
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 12px;
  color: white;
  margin-left: auto;
}

.audit-content {
  display: flex;
  padding: 24px;
  gap: 32px;
  border-bottom: 1px solid var(--border-color);
}

.score-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 200px;
  flex-shrink: 0;
}

.score-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.score-inner {
  width: 100px;
  height: 100px;
  background: white;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-value {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.score-label {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-top: 4px;
  font-weight: 600;
}

.score-desc {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  font-style: italic;
  text-align: center;
}

.gene-table-section {
  flex: 1;
}

.gene-table-section h4, .audit-advice h4 {
  font-size: 0.95rem;
  margin-bottom: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.gene-grid {
  display: grid;
  gap: 12px;
}

.gene-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--input-bg);
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.2s;
}

.gene-item:hover {
  border-color: var(--border-color);
  background: white;
}

.gene-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font-size: 1.2rem;
}

.gene-info {
  flex: 1;
}

.gene-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin-bottom: 2px;
}

.gene-value {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.audit-advice {
  padding: 24px;
  background: linear-gradient(to right bottom, #1e293b, #0f172a);
  color: white;
}

.audit-advice h4 {
  color: white;
  display: flex;
  align-items: center;
  gap: 8px;
}

.audit-advice p {
  font-size: 0.95rem;
  line-height: 1.6;
  color: #cbd5e1;
  white-space: pre-wrap;
  margin: 0;
}

.loading-spinner.small {
  width: 14px;
  height: 14px;
  border-width: 2px;
  margin-right: 6px;
}

.batch-panel {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.batch-config {
  width: 400px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  padding: 24px;
  overflow-y: auto;
  background: var(--main-bg);
}

.template-info {
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-link {
  color: var(--accent-color);
  text-decoration: none;
}

.preview-link:hover {
  text-decoration: underline;
}

.batch-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px;
  background: var(--main-bg);
  overflow: hidden;
}

.results-header {
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.results-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  background: var(--card-bg);
  gap: 16px;
  align-items: flex-start;
}

.result-item.success { border-left: 4px solid var(--success-color); }
.result-item.processing { border-left: 4px solid var(--accent-color); }
.result-item.failed { border-left: 4px solid var(--error-color); }
.result-item.pending { border-left: 4px solid var(--text-tertiary); }

.item-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
  gap: 4px;
}

.item-id {
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.item-status {
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(0,0,0,0.1);
}

.item-status.success { color: var(--success-color); background: rgba(16, 185, 129, 0.1); }
.item-status.processing { color: var(--accent-color); background: rgba(99, 102, 241, 0.1); }
.item-status.failed { color: var(--error-color); background: rgba(239, 68, 68, 0.1); }

.item-content {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-info p {
  margin-bottom: 4px;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.error-text {
  color: var(--error-color);
  font-size: 0.85rem;
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-tertiary);
  margin-top: 8px;
  background: rgba(0,0,0,0.02);
  padding: 4px 8px;
  border-radius: 4px;
  width: fit-content;
}

.step-indicator span.active {
  color: var(--accent-color);
  font-weight: 600;
}

.step-indicator .arrow {
  color: var(--text-tertiary);
  font-weight: normal;
}

.loading-dot {
  display: inline-block;
  animation: blink 1s infinite;
  margin-right: 2px;
}

@keyframes blink {
  0% { opacity: 0.2; }
  50% { opacity: 1; }
  100% { opacity: 0.2; }
}

.success-btn {
  background: var(--success-color);
}

.success-btn:hover {
  background: #059669; /* darker green */
  transform: translateY(-1px);
}

.image-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0;
}

.thumb-container {
  width: 40px;
  height: 40px;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumb-container:hover {
  border-color: var(--accent-color);
  transform: scale(1.1);
  transition: all 0.2s;
}

.thumb-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.manual-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(0,0,0,0.1);
  justify-content: flex-end;
}

.style-details {
  margin-top: 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  animation: slideDown 0.3s ease-out;
}

.style-details-header {
  padding: 8px 16px;
  background: rgba(0,0,0,0.03);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.style-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.style-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.style-length {
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.copy-style-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-style-btn:hover {
  background: rgba(0,0,0,0.05);
  color: var(--text-primary);
  border-color: var(--text-tertiary);
}

.style-content-wrapper {
  max-height: 400px;
  overflow-y: auto;
  background: var(--input-bg);
}

.style-content {
  padding: 16px;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.6;
  color: var(--text-primary);
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: translateY(0); }
}

.file-name {
  font-size: 0.85rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.item-actions {
  display: flex;
  gap: 8px;
}

.preview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.8);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px;
}

.preview-content {
  background: white;
  border-radius: 8px;
  position: relative;
  max-width: 95%;
  max-height: 95%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #eee;
  background: #fff;
  flex-shrink: 0;
}

.preview-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #333;
  font-weight: 600;
}

.preview-body {
  padding: 20px;
  overflow: auto;
  flex: 1;
  display: flex;
  justify-content: center;
  background: #f8fafc;
}

.close-preview {
  background: #f1f1f1;
  border: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-preview:hover {
  background: #e2e2e2;
}

.preview-iframe {
  width: 1280px;
  height: 720px;
  border: none;
}

.preview-image-full {
  max-width: 100%;
  max-height: 80vh;
}

.model-info {
  background: rgba(0,0,0,0.03);
  padding: 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.model-info p {
  margin-bottom: 4px;
}

.single-mode-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.left-panel {
  width: 420px;
  min-width: 380px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  background: var(--main-bg);
}

.right-panel {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: var(--main-bg);
}

.form-section {
  padding: 24px;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.form-field {
  margin-bottom: 16px;
}

.form-field:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
}

.hint {
  font-weight: 400;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

/* 配置区域 */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin: 24px 0;
}

.config-group {
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: var(--card-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.config-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-color);
}

.model-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--input-bg);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.2s;
}

.model-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.model-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.upload-section {
  margin-bottom: 0;
}

.upload-area {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--input-bg);
}

.upload-area:hover,
.upload-area.dragging {
  border-color: var(--accent-color);
  background: var(--hover-bg);
}

.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary);
}

.upload-icon {
  font-size: 3rem;
}


.compact-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  border-right: 1px solid var(--border-color);
  width: 320px; /* Slightly narrower */
}

.sidebar-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
  background: #f8fafc;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.compact-form {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.compact-group {
  margin-bottom: 12px;
}

.compact-label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.upload-section.compact {
  height: auto;
}

.upload-area.compact {
  padding: 12px;
  min-height: 80px;
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f9fafb;
}

.upload-area.compact.has-images {
  justify-content: flex-start;
  padding: 8px;
  background: white;
  border-style: solid;
}

.upload-placeholder.compact {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.upload-icon.small {
  font-size: 1.2rem;
}

.images-preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
}

.mini-thumb {
  width: 60px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
  border: 1px solid #e2e8f0;
}

.mini-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mini-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 16px;
  height: 16px;
  background: rgba(0,0,0,0.5);
  color: white;
  border: none;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.add-more-btn {
  width: 60px;
  height: 40px;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 1.2rem;
  cursor: pointer;
}

.add-more-btn:hover {
  background: #f1f5f9;
  color: var(--accent-color);
  border-color: var(--accent-color);
}

.config-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.config-col {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.config-col.full-width {
  flex: 100%;
}

.compact-radio-group {
  display: flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
}

.compact-radio-group label {
  flex: 1;
  text-align: center;
  padding: 6px 0;
  font-size: 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.compact-radio-group label.active {
  background: white;
  color: var(--accent-color);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.compact-radio-group input {
  display: none;
}

.compact-select {
  width: 100%;
  padding: 6px 8px;
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: white;
}

.compact-textarea {
  width: 100%;
  padding: 8px 10px;
  font-size: 0.85rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  resize: none;
  min-height: 80px;
  font-family: inherit;
}

.compact-textarea.small {
  min-height: 50px;
}

.advanced-details {
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
  padding-top: 12px;
}

.advanced-details summary {
  font-size: 0.8rem;
  color: var(--accent-color);
  cursor: pointer;
  user-select: none;
  margin-bottom: 8px;
  font-weight: 500;
}

.advanced-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f8fafc;
  padding: 12px;
  border-radius: 8px;
}

.compact-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.8rem;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--border-color);
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.full-width {
  width: 100%;
  padding: 12px;
  font-size: 1rem;
}

.sub-actions {
  display: flex;
  gap: 12px;
  font-size: 0.8rem;
  color: var(--text-tertiary);
}

.sub-actions span {
  cursor: pointer;
  transition: color 0.2s;
}

.sub-actions span:hover:not(.disabled) {
  color: var(--accent-color);
  text-decoration: underline;
}

.sub-actions .divider {
  color: #cbd5e1;
  cursor: default;
  text-decoration: none !important;
}

.sub-actions span.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}


.number-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  background: var(--input-bg);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.number-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.number-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prompt-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  background: var(--input-bg);
  color: var(--text-primary);
  transition: border-color 0.2s;
}

.prompt-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.prompt-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.prompt-display {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 0.85rem;
  font-family: 'Consolas', 'Monaco', monospace;
  background: var(--card-bg);
  color: var(--text-secondary);
  line-height: 1.6;
  cursor: text;
  min-height: 100px;
  resize: vertical !important;
  overflow-y: auto;
}

.resizable {
  resize: vertical !important;
  overflow-y: auto;
}

.field-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.copy-btn {
  padding: 4px 12px;
  font-size: 0.8rem;
  background: var(--accent-gradient);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s, opacity 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.copy-btn:hover {
  transform: translateY(-1px);
  opacity: 0.9;
}

.copy-btn:active {
  transform: translateY(0);
}

.prompt-display-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.generate-btn {
  width: 100%;
  background: var(--accent-gradient);
  color: #ffffff;
  border: none;
  border-radius: 12px;
  padding: 14px 24px;
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

.stage-btn {
  background: var(--card-bg);
  color: var(--text-primary);
  border: 2px solid var(--border-color);
}

.stage-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  color: var(--accent-color);
  transform: translateY(-1px);
}

.primary-btn {
  background: var(--accent-gradient);
  color: #ffffff;
  border: none;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(184, 115, 51, 0.3);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.test-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.test-btn:hover:not(:disabled) {
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
}

.stop-btn {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.stop-btn:hover {
  box-shadow: 0 8px 24px rgba(239, 68, 68, 0.3);
}

.upload-btn {
  width: 100%;
  padding: 10px 16px;
  background: var(--card-bg);
  color: var(--text-primary);
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  text-align: center;
}

.upload-btn:hover:not(:disabled) {
  border-color: var(--accent-color);
  background: var(--input-bg);
}

.upload-btn:disabled {
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
.stream-output-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.stream-output {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stream-output label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
  flex-shrink: 0;
}

.stream-output .field-header {
  margin-bottom: 6px;
}

.stream-textarea {
  width: 100%;
  min-height: 150px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 10px;
  font-size: 0.72rem;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow-y: auto;
  resize: vertical !important;
}

.stream-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.radio-item input[type='radio'] {
  cursor: pointer;
}

.result-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 2px solid var(--border-color);
}

.result-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.result-content {
  margin-top: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-small {
  padding: 8px 16px;
  font-size: 0.9rem;
  background: var(--accent-gradient);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-small:hover {
  transform: translateY(-1px);
}

.html-preview {
  width: 1280px;
  height: 720px;
  max-width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.result-image {
  width: 100%;
  max-width: 1280px;
  height: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.error-message {
  padding: 16px;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  margin-top: 16px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--text-tertiary);
  min-height: 300px;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 1rem;
  color: var(--text-secondary);
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .panel-content {
    grid-template-columns: 1fr;
    height: auto;
  }

  .form-section {
    height: auto;
    max-height: none;
  }
}
</style>

