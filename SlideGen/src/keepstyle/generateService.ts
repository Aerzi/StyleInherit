/**
 * 生成服务
 * 根据提取的样式和用户输入生成 HTML 或图片
 */

import type { GenerateRequest, GenerateResult, GenerateCallbacks } from './types';
import { generateImageByApi } from './imageGenerateService';
import { generateWithCustomModel } from '../services/customAiService';

// 从环境变量或默认值获取配置
function getConfig() {
  return {
    apiUrl: (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: (import.meta as any).env?.VITE_API_KEY || '',
    model: (import.meta as any).env?.VITE_MODEL_NAME || 'gpt-4o',
    stream: true,
  };
}

// 默认的HTML生成提示词 (不再使用，已合并到 buildHtmlPrompt)
// const DEFAULT_HTML_PROMPT = '...';

/**
 * 构建生成 HTML 的提示词
 */
function buildHtmlPrompt(request: GenerateRequest): string {
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

9.布局定位原则：

  - 禁止背景、图片块等遮盖文字，，背景badkground的节点, z-index的层级不要太高, 尽量z-index小一些而且不要挡住后续内容，禁止出现背景遮挡正文的情况，不导致元素与正文内容重叠。

  - 图表、卡片及关键内容区域，不得浮动或使用绝对定位，禁止元素因定位不当导致互相重叠或层叠顺序混；

10.尽量避免背景是渐变阴影，页面背景的颜色只有一层即可

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

9.布局定位原则：

  - 禁止背景、图片块等遮盖文字，，背景badkground的节点, z-index的层级不要太高, 尽量z-index小一些而且不要挡住后续内容，禁止出现背景遮挡正文的情况，不导致元素与正文内容重叠。

  - 图表、卡片及关键内容区域，不得浮动或使用绝对定位，禁止元素因定位不当导致互相重叠或层叠顺序混；

10.尽量避免背景是渐变阴影，页面背景的颜色只有一层即可

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
  // 优先使用 customAiService (保证 ping 通)
  // 如果没有指定 model 或者 model 包含 'doubao'，则尝试使用 customAiService
  // 或者我们可以直接强制使用它，因为用户特别要求了 "调用我之前的customService"
  const useThinking = true; 
  
  if (useThinking) {
      const prompt = buildHtmlPrompt(request);
      
      // 注意：generateWithCustomModel 内部会自动构建 messages (包括图片)
      // 我们只需要传入 prompt 和 images
      
      try {
          // 这里我们传入 prompt
          // imageBase64s 已经在 request 中
          return await generateWithCustomModel({
              prompt: prompt,
              images: request.imageBase64s, // 如果有图片，传递给 customService
              stream: true
          }, {
              onStreamContent: callbacks?.onStreamContent,
              onError: callbacks?.onError,
              onComplete: callbacks?.onComplete
          });
      } catch (e) {
          console.error('CustomService 调用失败，尝试回退到标准逻辑', e);
          // 如果失败，继续下面的标准逻辑
      }
  }

  const config = getConfig();
  const prompt = buildHtmlPrompt(request);
  
  // 通知提示词已准备好
  callbacks?.onPromptReady?.(prompt);

  // 构建消息内容（支持多模态图片）
  let messages: Array<{ role: 'user' | 'assistant' | 'system'; content: any }>;
  
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
    let cleanContent = fullContent.replace(/```html/g, '').replace(/```/g, '');

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
 * 生成幻灯片（HTML 或图片）
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
    } else {
      const imageUrl = await generateImage(request, callbacks);
      callbacks?.onComplete?.();
      return {
        imageUrl,
        success: true,
      };
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

