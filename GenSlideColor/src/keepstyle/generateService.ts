/**
 * 生成服务
 * 根据提取的样式和用户输入生成 HTML 或图片
 */

import type { GenerateRequest, GenerateResult, GenerateCallbacks } from './types';
import { generateImageByApi } from './imageGenerateService';
import { generateWithCustomModel } from '../services/customAiService';
import { 
  IMAGE_REFERENCE_HTML_PROMPT, 
  TEXT_ONLY_HTML_PROMPT
} from '../assets/prompts/image-reference-prompt';

// 从环境变量或默认值获取配置
function getConfig() {
  return {
    apiUrl: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_KEY || '',
    model: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_NAME || 'gpt-4o',
    stream: true,
  };
}

/**
 * 构建模板参考提示词片段（通用）
 * 不管是哪种模式，只要选择了模板，就需要追加模板布局参考
 */
function buildTemplateReferencePrompt(htmlTemplate: string, width: number, height: number): string {
  return `

## 【重要】参考模板布局

以下是用户选择的 HTML 模板，请**严格参考**此模板的 DOM 结构和布局逻辑，确保生成的页面不会爆版溢出：

\`\`\`html
${htmlTemplate}
\`\`\`

### 模板使用规则（必须遵守）

1. **布局结构**：严格参考模板的整体布局结构（如 header、main、footer 的分区方式）
2. **元素数量**：参考模板中各区块的元素数量，避免内容过多导致溢出
3. **尺寸约束**：页面必须精确适配 ${width}px × ${height}px，设置 \`body { overflow: hidden !important; }\`
4. **防止爆版**：
   - 如果内容过多，**必须**减小字号或精简内容
   - 严禁通过增加高度或滚动条来解决
   - 参考模板中的 padding、margin、gap 等间距设置
5. **样式独立**：颜色、字体等视觉样式由用户输入或参考图片决定，模板仅提供布局参考
6. **层级规范**：
   - 所有装饰元素（背景渐变、图案、几何形状）必须设置低 z-index（0-1）
   - 主要内容（标题、正文、数据、图表）必须设置高 z-index（10+）
   - **绝对禁止装饰元素遮挡核心内容**

`;
}

/**
 * 根据模式选择并构建 HTML 提示词
 */
function buildHtmlPromptByMode(request: GenerateRequest): string {
  const width = request.width || 1280;
  const height = request.height || 720;
  const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
  
  // 根据 promptMode 选择不同的提示词模板
  const mode = request.promptMode || 'style_extract';
  
  // 检查是否有模板需要追加
  const hasTemplate = request.htmlTemplate && request.htmlTemplate.trim();
  const templatePrompt = hasTemplate 
    ? buildTemplateReferencePrompt(request.htmlTemplate!.trim(), width, height) 
    : '';
  
  let basePrompt: string;
  
  switch (mode) {
    case 'image_reference':
      // 图片直接参考模式 - 关闭样式提取，直接参考图片
      basePrompt = IMAGE_REFERENCE_HTML_PROMPT
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
      break;
    
    case 'text':
      // 纯文本模式 - 无图片参考
      basePrompt = TEXT_ONLY_HTML_PROMPT
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
      break;
    
    case 'style_extract':
    default:
      // 样式提取模式 - 使用提取后的样式描述（原有逻辑）
      // 注意：buildStyleExtractHtmlPrompt 内部已有模板处理逻辑
      return buildStyleExtractHtmlPrompt(request);
  }
  
  // 对于 image_reference 和 text 模式，追加模板参考（如果有）
  return basePrompt + templatePrompt;
}

/**
 * 样式提取模式的 HTML 提示词（原有逻辑）
 */
function buildStyleExtractHtmlPrompt(request: GenerateRequest): string {
  // 如果用户提供了系统提示词，则完全使用用户提供的（全替换）
  // 如果用户没有提供，则使用默认提示词 + 固定的任务说明
  let prompt: string;
  
  // HTML 生成时使用 1280x720
  const width = request.width || 1280;
  const height = request.height || 720;
  
  // 如果提供了HTML模板，使用基于模板的提示词
  if (request.htmlTemplate && request.htmlTemplate.trim()) {
    const htmlTemplate = request.htmlTemplate.trim();
    
    // 即使提供了系统提示词，也要包含模板信息
    if (request.systemPrompt && request.systemPrompt.trim()) {
      // 用户提供了系统提示词，替换占位符并在提示词基础上添加模板信息
      const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
      const slideStyle = request.styleDescription || '';
      
      prompt = request.systemPrompt.trim()
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^slideStyle\^\}/g, slideStyle)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));

      prompt += `\n\n## HTML模板\n以下是参考的HTML模板，请**严格基于**此模板的结构和布局，结合提取的设计风格和用户主题，生成新的HTML页面：\n\n\`\`\`html\n${htmlTemplate}\n\`\`\`\n\n**CRITICAL / 严格执行要求**：\n1. **绝对禁止修改 DOM 结构**：必须严格保持模板的 DOM 结构、嵌套关系和关键 class 名不变。\n2. **严格禁止滚动条**：页面必须精确适配 {^width^}px × {^height^}px，设置 body { overflow: hidden !important; }，绝对不允许出现任何方向的滚动条。\n3. **内容适配**：如果内容过多，**必须**通过减小字号或精简文字来适配，严禁通过增加高度或滚动条来解决。\n4. **样式替换**：将模板的颜色、字体等样式替换为提取的设计风格，但保持布局逻辑不变。`;
    } else {
      // 使用基于模板的默认提示词
      const defaultPrompt = `# 角色

你是一个专业的html设计师，擅长根据用户的输入内容"{^information^}"，请根据用户输入内容创建一张高质量的 HTML 幻灯片页面。



## 输入内容

{^information^}



## 风格样式参数

{^slideStyle^}



## 设计要求

**首要原则**：风格样式参数中明确指定的内容，严格按照参数执行。

1. 尺寸固定为 {^width^}px × {^height^}px

2. 现代、专业的设计风格，配色和谐

3. 文字清晰可读，排版美观

4. 可使用渐变、阴影、圆角等现代设计元素

5. 尽量避免蓝紫渐变色和发光效果

6. 请你确保<header>的元素中，只有main-title，其余的sub-title以及sort元素均不需要

7. 请你确保主体中尽量减少留白与空缺

8. 数据展示：

   -ECharts请使用canvas模式，不要使用svg模式的，请尽量使用canvas模式(renderer: 'canvas')

   -<canvas> 明确 width 与 height，容器使用 shrink-0 与固定 max-h，overflow-hidden 防止溢出，禁止图表溢出页面 {max-height:  {^height^}px}。

   -Chart.js 配置 responsive: false、maintainAspectRatio: false，坐标轴、图例字号与颜色应适配主题与深浅背景，Chart.js 配置中 animation 必须为 false。

9. **层级规范（CRITICAL - 必须严格遵守）**：

  - **装饰元素层级最低**：所有背景装饰（渐变、图案、几何形状、背景图片）必须设置 z-index: 0 或 1
  - **主要内容层级最高**：标题、正文、数据、图表等核心展示内容必须设置 z-index: 10 或以上
  - **绝对禁止遮挡**：任何样式/装饰元素都不能遮挡核心内容，装饰只能作为背景衬托
  - **定位规范**：使用 position: absolute 的装饰元素必须同时设置低 z-index，主要内容容器设置 position: relative; z-index: 10 确保层级更高
  - 图表、卡片及关键内容区域，不得因定位不当导致互相重叠

10. 尽量避免背景是渐变阴影，页面背景的颜色只有一层即可

10. 保证资源来自于以下可用资源



## 可用资源（必须从中选取使用）

1. **Font Awesome 6** - 用于图标

   \`<link rel="stylesheet" href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/font-awesome/css/all.min.css">\`

   使用示例：\`<i class="fa-solid fa-chart-line"></i>\`

2. **ECharts 5** - 用于数据可视化图表（如果内容涉及数据展示）

   \`<script src="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/echarts.min.js"></script>\`

   图表必须在页面加载时立即渲染，不依赖用户交互

   不要使用svg模式的，请尽量使用canvas模式

   **必须关闭动画**：配置中设置 \`animation: false\`

3. **Fonts** - 用于优质字体

   \`<link href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/css2/css2.css" rel="stylesheet">\`



## 严格禁止 / CRITICAL

- **严格禁止任何 CSS 动画**（animation、transition、@keyframes）

- **严格禁止任何 hover、focus、active 等伪类效果**

- **严格禁止滚动条**：必须设置 \`body { overflow: hidden !important; }\`，页面内容**绝对不能**超出 {^width^}px × {^height^}px。

- **禁止任何需要用户交互才能显示的内容**

- **禁止图表动画**（ECharts 必须设置 animation: false）

- **禁止元素溢出**：如果内容过多，**必须**缩小字号或删减内容，**绝对禁止**通过滚动查看。

- 这是静态 PPT，所有内容必须在页面加载后立即可见



## 如果生成的html不符合严格禁止里的要求，请修复，修复要求：

1. 保持原有的设计风格、配色、字体不变

2. 只修改导致排版问题的部分

3. **确保修复后的页面尺寸严格为 1280px × 720px，无滚动条**

4. 如果内容过多导致溢出，可以：

   - 适当减小字体大小

   - 减少间距

   - 精简文字内容

   - 调整布局结构

5. 确保所有内容都在可视区域内



## 输出格式

请直接输出完整的 HTML 代码，不要包含 markdown 代码块标记，不要包含任何解释性文字。
HTML 代码必须以 <!DOCTYPE html> 开头，以 </html> 结尾。
包含完整结构：
<!DOCTYPE html>
<html lang="zh-CN">
<head>
...
</head>
<body>
...
</body>
</html>

请直接输出 HTML 代码，不要添加任何解释。

宽高默认是1280*720，风格样式参数就是阶段一的全部输出`;

      // 替换占位符
      const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
      const slideStyle = request.styleDescription || '';
      
      prompt = defaultPrompt
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^slideStyle\^\}/g, slideStyle)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
      
      // 如果有HTML模板，添加模板信息
      prompt += `\n\n## HTML模板\n以下是参考的HTML模板，请**严格基于**此模板的结构和布局，结合提取的设计风格和用户主题，生成新的HTML页面：\n\n\`\`\`html\n${htmlTemplate}\n\`\`\`\n\n**CRITICAL / 严格执行要求**：\n1. **绝对禁止修改 DOM 结构**：必须严格保持模板的 DOM 结构、嵌套关系和关键 class 名不变。禁止删除模板中的关键布局容器。\n2. **严格禁止滚动条**：页面必须精确适配 {^width^}px × {^height^}px，设置 body { overflow: hidden !important; }，绝对不允许出现任何方向的滚动条。\n3. **内容适配**：如果内容过多，**必须**通过减小字号或精简文字来适配，严禁通过增加高度或滚动条来解决。\n4. **样式替换**：将模板中的颜色、字体、圆角等样式替换为提取的【风格样式参数】。\n5. **图表**：如果模板中有 ECharts 图表，请保持配置结构，仅修改数据和颜色以匹配主题，且必须关闭动画。`;
    }
  } else {
    // 没有提供HTML模板，使用原来的逻辑
    if (request.systemPrompt && request.systemPrompt.trim()) {
      // 用户提供了系统提示词，替换占位符后直接使用
      const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
      const slideStyle = request.styleDescription || '';
      
      prompt = request.systemPrompt.trim()
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^slideStyle\^\}/g, slideStyle)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
    } else {
      // 用户没有提供系统提示词，使用默认提示词
      const defaultPrompt = `# 角色

你是一个专业的html设计师，擅长根据用户的输入内容"{^information^}"，请根据用户输入内容创建一张高质量的 HTML 幻灯片页面。



## 输入内容

{^information^}



## 风格样式参数

{^slideStyle^}



## 设计要求

**首要原则**：风格样式参数中明确指定的内容，严格按照参数执行。

1. 尺寸固定为 {^width^}px × {^height^}px

2. 现代、专业的设计风格，配色和谐

3. 文字清晰可读，排版美观

4. 可使用渐变、阴影、圆角等现代设计元素

5. 尽量避免蓝紫渐变色和发光效果

6. 请你确保<header>的元素中，只有main-title，其余的sub-title以及sort元素均不需要

7. 请你确保主体中尽量减少留白与空缺

8. 数据展示：

   -ECharts请使用canvas模式，不要使用svg模式的，请尽量使用canvas模式(renderer: 'canvas')

   -<canvas> 明确 width 与 height，容器使用 shrink-0 与固定 max-h，overflow-hidden 防止溢出，禁止图表溢出页面 {max-height:  {^height^}px}。

   -Chart.js 配置 responsive: false、maintainAspectRatio: false，坐标轴、图例字号与颜色应适配主题与深浅背景，Chart.js 配置中 animation 必须为 false。

9. **层级规范（CRITICAL - 必须严格遵守）**：

  - **装饰元素层级最低**：所有背景装饰（渐变、图案、几何形状、背景图片）必须设置 z-index: 0 或 1
  - **主要内容层级最高**：标题、正文、数据、图表等核心展示内容必须设置 z-index: 10 或以上
  - **绝对禁止遮挡**：任何样式/装饰元素都不能遮挡核心内容，装饰只能作为背景衬托
  - **定位规范**：使用 position: absolute 的装饰元素必须同时设置低 z-index，主要内容容器设置 position: relative; z-index: 10 确保层级更高
  - 图表、卡片及关键内容区域，不得因定位不当导致互相重叠

10. 尽量避免背景是渐变阴影，页面背景的颜色只有一层即可

10. 保证资源来自于以下可用资源



## 可用资源（必须从中选取使用）

1. **Font Awesome 6** - 用于图标

   \`<link rel="stylesheet" href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/html-slides/static/font-awesome/css/all.min.css">\`

   使用示例：\`<i class="fa-solid fa-chart-line"></i>\`

2. **ECharts 5** - 用于数据可视化图表（如果内容涉及数据展示）

   \`<script src="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/echarts.min.js"></script>\`

   图表必须在页面加载时立即渲染，不依赖用户交互

   不要使用svg模式的，请尽量使用canvas模式

   **必须关闭动画**：配置中设置 \`animation: false\`

3. **Fonts** - 用于优质字体

   \`<link href="https://wpp-figma-slide.ks3-cn-beijing.ksyuncs.com/slide_res/20241121/css2/css2.css" rel="stylesheet">\`



## 严格禁止 / CRITICAL

- **严格禁止任何 CSS 动画**（animation、transition、@keyframes）

- **严格禁止任何 hover、focus、active 等伪类效果**

- **严格禁止滚动条**：必须设置 \`body { overflow: hidden !important; }\`，页面内容**绝对不能**超出 {^width^}px × {^height^}px。

- **禁止任何需要用户交互才能显示的内容**

- **禁止图表动画**（ECharts 必须设置 animation: false）

- **禁止元素溢出**：如果内容过多，**必须**缩小字号或删减内容，**绝对禁止**通过滚动查看。

- 这是静态 PPT，所有内容必须在页面加载后立即可见



## 如果生成的html不符合严格禁止里的要求，请修复，修复要求：

1. 保持原有的设计风格、配色、字体不变

2. 只修改导致排版问题的部分

3. **确保修复后的页面尺寸严格为 1280px × 720px，无滚动条**

4. 如果内容过多导致溢出，可以：

   - 适当减小字体大小

   - 减少间距

   - 精简文字内容

   - 调整布局结构

5. 确保所有内容都在可视区域内



## 输出格式

请直接输出完整的 HTML 代码，不要包含 markdown 代码块标记，不要包含任何解释性文字。
HTML 代码必须以 <!DOCTYPE html> 开头，以 </html> 结尾。
包含完整结构：
<!DOCTYPE html>
<html lang="zh-CN">
<head>
...
</head>
<body>
...
</body>
</html>

请直接输出 HTML 代码，不要添加任何解释。

宽高默认是1280*720，风格样式参数就是阶段一的全部输出`;

      // 替换占位符
      const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
      const slideStyle = request.styleDescription || '';
      
      prompt = defaultPrompt
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^slideStyle\^\}/g, slideStyle)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
    }
  }
  
  return prompt;
}

/**
 * 生成 HTML 幻灯片
 */
async function generateHtml(
  request: GenerateRequest,
  callbacks?: GenerateCallbacks
): Promise<string> {
  // 根据模式选择提示词
  const prompt = buildHtmlPromptByMode(request);
  
  // 优先使用 customAiService
  const useThinking = true; 
  
  if (useThinking) {
      try {
          return await generateWithCustomModel({
              prompt: prompt,
              images: request.imageBase64s, // 如果有图片，传递给 customService
              stream: true,
              mode: request.promptMode // 传递模式信息
          }, {
              onStreamContent: callbacks?.onStreamContent,
              onError: callbacks?.onError,
              onComplete: callbacks?.onComplete
          });
      } catch (e) {
          console.error('CustomService 调用失败，尝试回退到标准逻辑', e);
      }
  }

  const config = getConfig();
  
  // 通知提示词已准备好
  callbacks?.onPromptReady?.(prompt);

  // 构建消息内容（支持多模态图片）
  type MessageContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  let messages: Array<{ role: 'user' | 'assistant' | 'system'; content: MessageContent }>;
  
  if (request.imageBase64s && request.imageBase64s.length > 0) {
    // 如果有图片，使用多模态格式
    const imageContents = request.imageBase64s.map((imageBase64) => {
      const imageUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/png;base64,${imageBase64}`;
      return {
        type: 'image_url' as const,
        image_url: { url: imageUrl },
      };
    });
    
    messages = [{
      role: 'user' as const,
      content: [
        ...imageContents,
        {
          type: 'text' as const,
          text: prompt,
        },
      ],
    }];
  } else {
    // 普通文本消息
    messages = [{ role: 'user' as const, content: prompt }];
  }

  if (config.stream) {
    // 流式响应
    let fullContent = '';

    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || config.model,
        messages,
        temperature: 0.2,
        max_tokens: request.maxTokens || 16000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = `生成失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
      callbacks?.onError?.(error);
      throw new Error(error);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              callbacks?.onStreamContent?.(fullContent);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    // 处理最终内容
    // 1. 移除 markdown 代码块标记
    const cleanContent = fullContent.replace(/```html/g, '').replace(/```/g, '');

    // 2. 尝试提取 ===SLIDE_START=== ... ===SLIDE_END=== (兼容旧逻辑)
    const htmlMatch = cleanContent.match(/===SLIDE_START===\s*([\s\S]*?)\s*===SLIDE_END===/);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }

    // 3. 尝试提取 <!DOCTYPE ... </html>
    const htmlMatch2 = cleanContent.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
    if (htmlMatch2) {
      return htmlMatch2[1].trim();
    }

    // 4. 尝试提取 <html ... </html>
    const htmlMatch3 = cleanContent.match(/(<html[\s\S]*<\/html>)/i);
    if (htmlMatch3) {
      return `<!DOCTYPE html>\n${htmlMatch3[1].trim()}`;
    }
    
    // 5. 如果只是部分片段，尝试 <!DOCTYPE 开头的所有内容
    const htmlMatch4 = cleanContent.match(/(<!DOCTYPE[\s\S]*)/i);
    if (htmlMatch4) {
      return htmlMatch4[1].trim();
    }

    throw new Error('未找到 HTML 内容');
  } else {
    // 非流式响应
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || config.model,
        messages,
        temperature: 0.2,
        max_tokens: request.maxTokens || 16000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = `生成失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
      callbacks?.onError?.(error);
      throw new Error(error);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 提取 HTML
    let html = content.replace(/```html/g, '').replace(/```/g, '');
    
    // 尝试提取标记之间的内容
    const markerMatch = html.match(/===SLIDE_START===\s*([\s\S]*?)\s*===SLIDE_END===/);
    if (markerMatch) {
      return markerMatch[1].trim();
    }
    
    // 移除残留标记
    html = html.replace(/===SLIDE_START===/g, '').replace(/===SLIDE_END===/g, '');
    
    const htmlMatch = html.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
    if (htmlMatch) {
      return htmlMatch[1].trim();
    }
    
    const htmlMatch2 = html.match(/(<html[\s\S]*<\/html>)/i);
    if (htmlMatch2) {
      return `<!DOCTYPE html>\n${htmlMatch2[1].trim()}`;
    }
    
    const htmlMatch3 = html.match(/(<!DOCTYPE[\s\S]*)/i);
    if (htmlMatch3) {
      return htmlMatch3[1].trim();
    }

    if (html.includes('<body') && html.includes('</body')) {
        return html.trim();
    }

    throw new Error('未找到有效的 HTML 内容');
  }
}

/**
 * 生成图片（通过提交任务+轮询方式）
 * 参考 D:\jiazaixiang\kwppbeautify_jsaddons\src\components\AiBananaFullPpt.vue
 * 使用 submitImageTask + queryTaskStatus 的方式
 */
async function generateImage(
  request: GenerateRequest,
  callbacks?: GenerateCallbacks
): Promise<string> {
  // 使用图片生成 API（提交任务+轮询），返回图片 URL
  const imageUrl = await generateImageByApi(request, callbacks);
  return imageUrl;
}

/**
 * 生成幻灯片（HTML、图片或同时生成）
 */
export async function generateSlide(
  request: GenerateRequest,
  callbacks?: GenerateCallbacks
): Promise<GenerateResult> {
  try {
    if (request.outputType === 'html') {
      const html = await generateHtml(request, callbacks);
      callbacks?.onComplete?.();
      return {
        html,
        success: true,
      };
    } else if (request.outputType === 'image') {
      const imageUrl = await generateImage(request, callbacks);
      callbacks?.onComplete?.();
      return {
        imageUrl,
        success: true,
      };
    } else if (request.outputType === 'both') {
      // 同时生成 HTML 和图片（并行执行）
      callbacks?.onStreamContent?.('🚀 正在并行生成 HTML 和图片...\n');
      
      // 为 HTML 和图片分别创建请求
      const htmlRequest = { ...request, outputType: 'html' as const };
      const imageRequest = { 
        ...request, 
        outputType: 'image' as const,
        // 图片使用不同的尺寸
        width: 3600,
        height: 2025
      };
      
      // 并行执行
      const [htmlResult, imageUrl] = await Promise.all([
        generateHtml(htmlRequest, {
          onStreamContent: (content) => {
            callbacks?.onStreamContent?.(`📄 HTML 生成中...\n${content}`);
          },
          onError: callbacks?.onError
        }),
        generateImage(imageRequest, {
          onStreamContent: (content) => {
            callbacks?.onStreamContent?.(`🖼️ 图片生成中...\n${content}`);
          },
          onError: callbacks?.onError
        })
      ]);
      
      callbacks?.onComplete?.();
      return {
        html: htmlResult,
        imageUrl,
        success: true,
      };
    } else {
      throw new Error(`不支持的输出类型: ${request.outputType}`);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errMsg);
    return {
      success: false,
      error: errMsg,
    };
  }
}

