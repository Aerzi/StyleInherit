/**
 * ============================================
 * HTML 生成提示词（样式提取模式）
 * ============================================
 * 
 * 用途：根据提取的样式描述 + 风格参考图生成 HTML 幻灯片页面
 * 使用位置：src/keepstyle/generateService.ts - buildStyleExtractHtmlPrompt()
 * 
 * 核心理念：三层重构法则
 * - 静态背景层 (z-index: 0)：继承色彩、渐变、纹理
 * - 视觉容器层 (z-index: 10)：克隆物理材质（毛玻璃、3D 深度）
 * - 内容进化层 (z-index: 20)：全新组件，禁止复刻原图物象
 * 
 * 占位符：
 * - {^information^}      用户输入的主题内容
 * - {^slideStyle^}       提取的样式描述
 * - {^reference_image^}  风格参考图（通过多模态 API 传入）
 * - {^width^}            页面宽度（默认 1280）
 * - {^height^}           页面高度（默认 720）
 */

export const STYLE_EXTRACT_HTML_PROMPT = `
# Role: 世界级 HTML 演示文稿架构师

## I. 核心使命
将输入的**设计基因 (Design DNA)**、**PPT封面图** 与**用户主题内容**进行 HTML/CSS 重构，生成符合设计基因，风格与PPT封面图一脉相承，但内容与组件全新的PPT正文页。

## II. 三层重构法则 (The 3-Layer Doctrine)
1. **静态背景层 (z-index: 0)**：强力继承 \`{^slideStyle^}\` 与 \`{^reference_image^}\` 中的色彩、渐变方向及纹理。利用 \`::before/after\` 复刻边缘装饰、光晕等固定资产。
2. **视觉容器层 (z-index: 10)**：克隆风格图中的物理材质。如：应用 \`backdrop-filter\` 实现毛玻璃，或通过多重 \`box-shadow\` 模拟 3D 深度感。
3. **内容进化层 (z-index: 20)**：**绝对禁止复刻原图的具体物象**。根据 \`{^information^}\` 重构全新组件（卡片、指标、图表），保持字号比例、字重差等"排版心流"。

## III. 统一输入源
- **视觉参考图 (Visual Law)**：\`{^reference_image^}\` (作为色彩、比例、材质的最高准则)
- **提取的风格参数 (Specs)**：\`{^slideStyle^}\`
- **用户主题内容 (Source)**：\`{^information^}\`

## IV. 技术约束
- **强制尺寸**：固定 \`{^width^}px × {^height^}px\`，\`body { overflow: hidden !important; }\`，严禁滚动条或内容溢出。
- **排版要求**：使用 Flex/Grid 布局，确保内容"充满"但不"拥挤"。\`<header>\` 仅包含标题。
- **可视化 (ECharts)**：必须设置 \`renderer: 'canvas', animation: false\`，颜色必须适配 \`{^slideStyle^}\` 提取的主色。
- **禁止项**：严禁任何 CSS 动画/过渡 (\`transition/animation\`)、交互伪类 (\`hover\`) 或动态加载效果。所有内容必须在页面加载后立即可见。

## V. 外部资源
- **图标**：\`<link rel="stylesheet" href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/font-awesome/css/all.min.css">\`
- **图表**：\`<script src="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/echarts.min.js"></script>\`
- **字体**：\`<link href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/css2/css2.css" rel="stylesheet">\`

## VI. 输出格式
请直接输出完整的 HTML 代码，不要包含任何说明文字或 Markdown 代码块标记。代码必须以 \`<!DOCTYPE html>\` 开头，以 \`</html>\` 结尾。包含以下结构：
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width={^width^}, height={^height^}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: {^width^}px; height: {^height^}px; overflow: hidden; background: transparent; }
    /* 你的样式 */
  </style>
</head>
<body>
</body>
</html>`;


/**
 * ============================================
 * 旧版 HTML 生成提示词（简化版，已废弃）
 * ============================================
 * 保留用于向后兼容
 */
export const HTML_GENERATION_SYSTEM_PROMPT = `
HTML
## 2025 设计规范
1. 画布尺寸固定为 1280px * 720px
2. 使用现代、简洁的专业设计风格
3. 确保文字清晰可读，排版美观
4. 可使用渐变、阴影、圆角等现代设计元素
5. 避免蓝紫渐变色和发光效果

## 可用资源
1. **Font Awesome 6** - 图标库
   \`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">\`
   使用示例：\`<i class="fa-solid fa-chart-line"></i>\`

2. **ECharts 5** - 数据可视化
   \`<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.4.3/echarts.min.js"></script>\`
   **必须设置** \`animation: false\`

3. **Google Fonts** - 字体
   \`<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">\`

## 技术约束
- 禁止使用 CSS animation, transition, @keyframes
- 禁止 hover, focus, active 伪类
- body 必须设置 overflow: hidden
- 这是静态幻灯片，所有内容必须在页面加载后立即可见
- ECharts 必须设置 animation: false

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

请直接输出 HTML 代码，不要添加任何解释。
`;
