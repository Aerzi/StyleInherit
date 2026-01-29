import type { GenerateRequest } from '../services/llmService'
import { loadAndAnalyzeTemplates, generateTemplateIndex } from './template-analyzer'

/**
 * 自动下载提示词（只下载实际使用的）
 */
export async function autoDownloadPrompts(
  generateRequest: GenerateRequest,
  userPrompt: string,
  usedIntentRecognition: boolean = false
): Promise<void> {
  try {
    const prompts: string[] = []
    
    // 1. 生成HTML幻灯片的提示词（总是下载，因为这是实际使用的）
    prompts.push('# 生成HTML幻灯片提示词（实际使用）\n')
    prompts.push('='.repeat(80))
    prompts.push(buildGeneratePrompt(generateRequest))
    prompts.push('\n\n')
    
    // 2. 如果使用了意图识别，下载意图识别提示词（已包含完整模板列表）
    if (usedIntentRecognition) {
      try {
        const templateInfos = await loadAndAnalyzeTemplates()
        if (templateInfos.length > 0) {
          const templateIndex = generateTemplateIndex(templateInfos)
          prompts.push('# 意图识别提示词（实际使用）\n')
          prompts.push('='.repeat(80))
          prompts.push(buildIntentRecognitionPrompt(userPrompt, templateIndex))
          prompts.push('\n\n')
          // 注意：不再单独下载模板索引文档，因为意图识别提示词中已经包含了完整的模板列表和HTML内容
        }
      } catch (error) {
        console.warn('加载模板失败:', error)
      }
    }
    
    // 自动下载文件
    const content = prompts.join('\n')
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = usedIntentRecognition 
      ? `prompts-with-intent-${timestamp}.txt`
      : `prompts-${timestamp}.txt`
    downloadFile(content, filename, 'text/plain')
  } catch (error) {
    console.error('自动下载提示词失败:', error)
  }
}

/**
 * 构建生成提示词（从llmService.ts复制逻辑）
 */
function buildGeneratePrompt(request: GenerateRequest): string {
  const { prompt, referenceType, customReference } = request

  let referenceInfo = ''

  if (referenceType === 'custom' && customReference) {
    if (customReference.type === 'html') {
      referenceInfo = `
## 参考模板（必须严格遵循）
\`\`\`html
${customReference.content}
\`\`\`

### 模板使用要求
1. **保持完全相同的 HTML 结构**：不要增删任何 DOM 节点，保持标签层级和嵌套关系
2. **保持完全相同的 CSS 样式**：复用模板的所有样式定义（颜色、字体、间距、布局等）
3. **只替换文字内容**：将模板中的示例文字替换为与用户主题相关的内容
4. **保持图标类型**：如果模板使用了 Font Awesome 图标，保持相同位置使用图标，可更换为更贴合主题的图标
5. **保持数据结构**：如果模板包含图表/数据，保持相同的数据展示方式，只更换具体数值和标签
6. **填充所有占位内容**：确保模板中每一个文字区域都根据主题填入有意义的内容`
    } else if (customReference.type === 'url') {
      referenceInfo = `
## 参考网址
${customReference.content}
请参考该网页的整体视觉风格、配色方案和布局结构来设计。`
    } else if (customReference.type === 'image') {
      referenceInfo = `
你是一个专业的全栈前端开发者，擅长从 UI 截图或设计图精确复刻成现代、干净、可响应的 HTML 和 CSS 代码。

任务：基于上传的图片，生成一个像素级接近的单文件 HTML（包含内联 CSS 或 Tailwind CDN），完美复刻布局、颜色、字体、间距、阴影和所有视觉元素。

步骤：
1. 先详细分析图片：描述整体布局（grid/flex）、主要组件（header、cards、buttons 等）、颜色方案（用 hex 值）、typography、spacing 和任何微交互提示。
2. 然后生成代码：使用 HTML5 + Tailwind CSS（通过 CDN），确保响应式（mobile-first），代码干净、可读、无多余元素。
3. 只输出完整的 HTML 代码（从 <html> 开始），用\`\`\`html 包裹，便于复制。
4. 如果图片有文本，确保精确复制；如果有图标，用合适 emoji 或描述替代。

严格要求：
- 100% 基于图片，不要添加或省略任何可见元素。
- 优先使用 Tailwind 类实现样式。
- 确保在桌面和手机上看起来一致。
- 输出前验证代码有效性。

现在开始分析并生成代码。`
    } else if (customReference.type === 'pptx') {
      referenceInfo = `
## 参考文件
用户上传了PPTX文件（${customReference.filename}），请：
1. 复刻其布局结构和设计风格
2. 保持相同的配色方案
3. 根据用户主题替换所有文字内容`
    }
  }

  return `${referenceInfo}
    
请为以下主题创建一张高质量的 HTML 幻灯片页面。

## 主题
${prompt}


## 设计要求
1. 尺寸固定为 1280px × 720px
2. 现代、专业的设计风格，配色和谐
3. 文字清晰可读，排版美观
4. 可使用渐变、阴影、圆角等现代设计元素
5. 避免蓝紫渐变色和发光效果

## 可用资源（推荐使用）
1. **Font Awesome 6** - 用于图标
   \`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">\`
   使用示例：\`<i class="fa-solid fa-chart-line"></i>\`

2. **ECharts 5** - 用于数据可视化图表（如果内容涉及数据展示）
   \`<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js"></script>\`
   图表必须在页面加载时立即渲染，不依赖用户交互
   **必须关闭动画**：配置中设置 \`animation: false\`

3. **Google Fonts** - 用于优质字体
   \`<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">\`

## 严格禁止
- 禁止任何 CSS 动画（animation、transition、@keyframes）
- 禁止任何 hover、focus、active 等伪类效果
- 禁止滚动条（必须 overflow: hidden）
- 禁止任何需要用户交互才能显示的内容
- 禁止图表动画（ECharts 必须设置 animation: false）
- 这是静态 PPT，所有内容必须在页面加载后立即可见

## 输出格式
输出完整的 HTML 文档，以 ===SLIDE_START=== 开始，===SLIDE_END=== 结束：

===SLIDE_START===
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1280, height=720">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1280px; height: 720px; overflow: hidden; font-family: 'Noto Sans SC', sans-serif; }
    /* 你的样式 */
  </style>
</head>
<body>
  <!-- 你的内容 -->
  <!-- 如需 ECharts，在此添加 script 标签并立即初始化图表 -->
</body>
</html>
===SLIDE_END===

请直接输出 HTML 代码，不要添加任何解释。`
}

/**
 * 构建意图识别提示词
 */
function buildIntentRecognitionPrompt(userPrompt: string, templateIndex: string): string {
  return `你是一个专业的模板选择助手。请根据用户输入的主题，从以下模板列表中选择最匹配的HTML模板。

${templateIndex}

## 用户输入的主题
${userPrompt}

## 任务要求
1. 仔细分析用户主题的内容、风格、功能需求
2. 查看每个模板的完整HTML代码，理解其内容主题、视觉风格、功能特点
3. 严格按照上述"选择指南"中的优先级进行匹配
4. 优先考虑风格、内容和功能的匹配，结构或样式的差异可以忽略

请根据选择指南输出最匹配的模板ID。`
}

/**
 * 构建修复布局提示词（示例）
 */
// @ts-ignore - 保留以备后用
function buildFixLayoutPromptExample(): string {
  return `请修复以下 HTML 页面的排版问题。

## 检测到的问题
1. [ERROR] 内容溢出画布
   元素: .content
   详情: 元素高度超过720px，导致内容被裁剪

2. [WARNING] 字体过大
   元素: h1
   详情: 字体大小可能导致在小屏幕上显示异常

## 原始 HTML
\`\`\`html
<!-- 示例HTML代码 -->
\`\`\`

## 修复要求
1. 保持原有的设计风格、配色、字体不变
2. 只修改导致排版问题的部分
3. 确保修复后的页面尺寸严格为 1280px × 720px，无滚动条
4. 如果内容过多导致溢出，可以：
   - 适当减小字体大小
   - 减少间距
   - 精简文字内容
   - 调整布局结构
5. 确保所有内容都在可视区域内

## 输出格式
输出修复后的完整 HTML 文档，以 ===SLIDE_START=== 开始，===SLIDE_END=== 结束。
不要添加任何解释，直接输出修复后的 HTML。`
}

/**
 * 下载文件
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

