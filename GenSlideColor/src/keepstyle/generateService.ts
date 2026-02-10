/**
 * 生成服务
 * 根据提取的样式和用户输入生成 HTML 或图片
 */

import type { GenerateRequest, GenerateResult, GenerateCallbacks } from './types';
import { generateImageByApi } from './imageGenerateService';
import { generateWithCustomModel } from '../services/customAiService';
import { 
  IMAGE_REFERENCE_HTML_PROMPT, 
  TEXT_ONLY_HTML_PROMPT,
  STYLE_EXTRACT_HTML_PROMPT,
  TEMPLATE_REFERENCE_PROMPT,
  TEMPLATE_STRICT_RULES_PROMPT
} from '../assets/prompts';

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
 * 使用 src/assets/prompts/template-prompt.ts 中的模板
 */
function buildTemplateReferencePromptText(htmlTemplate: string, width: number, height: number): string {
  return TEMPLATE_REFERENCE_PROMPT
    .replace(/\{\^htmlTemplate\^\}/g, htmlTemplate)
    .replace(/\{\^width\^\}/g, String(width))
    .replace(/\{\^height\^\}/g, String(height));
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
    ? buildTemplateReferencePromptText(request.htmlTemplate!.trim(), width, height) 
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
 * 样式提取模式的 HTML 提示词
 * 使用 src/assets/prompts/html-gen-prompt.ts 中的 STYLE_EXTRACT_HTML_PROMPT
 */
function buildStyleExtractHtmlPrompt(request: GenerateRequest): string {
  const width = request.width || 1280;
  const height = request.height || 720;
  const information = request.userPrompt || '根据设计风格生成一张专业的 HTML 幻灯片页面';
  const slideStyle = request.styleDescription || '';
  
  let prompt: string;
  
  // 如果用户提供了系统提示词，优先使用
  if (request.systemPrompt && request.systemPrompt.trim()) {
    prompt = request.systemPrompt.trim()
      .replace(/\{\^information\^\}/g, information)
      .replace(/\{\^slideStyle\^\}/g, slideStyle)
      .replace(/\{\^width\^\}/g, String(width))
      .replace(/\{\^height\^\}/g, String(height));
  } else {
    // 使用统一管理的默认提示词
    prompt = STYLE_EXTRACT_HTML_PROMPT
      .replace(/\{\^information\^\}/g, information)
      .replace(/\{\^slideStyle\^\}/g, slideStyle)
      .replace(/\{\^width\^\}/g, String(width))
      .replace(/\{\^height\^\}/g, String(height));
  }
  
  // 如果有 HTML 模板，追加模板规则
  if (request.htmlTemplate && request.htmlTemplate.trim()) {
    const htmlTemplate = request.htmlTemplate.trim();
    const templateRules = TEMPLATE_STRICT_RULES_PROMPT
      .replace(/\{\^htmlTemplate\^\}/g, htmlTemplate)
      .replace(/\{\^width\^\}/g, String(width))
      .replace(/\{\^height\^\}/g, String(height));
    prompt += templateRules;
  }
  
  return prompt;
}

/**
 * 从 HTML 接口返回的完整内容中解析出 HTML（与 chat 流式/非流式使用同一套规则）
 */
function extractHtmlFromContent(fullContent: string): string {
  const cleanContent = fullContent.replace(/```html/g, '').replace(/```/g, '').trim();
  const m1 = cleanContent.match(/===SLIDE_START===\s*([\s\S]*?)\s*===SLIDE_END===/);
  if (m1) return m1[1].trim();
  const m2 = cleanContent.match(/(<!DOCTYPE[\s\S]*<\/html>)/i);
  if (m2) return m2[1].trim();
  const m3 = cleanContent.match(/(<html[\s\S]*<\/html>)/i);
  if (m3) return `<!DOCTYPE html>\n${m3[1].trim()}`;
  const m4 = cleanContent.match(/(<!DOCTYPE[\s\S]*)/i);
  if (m4) return m4[1].trim();
  if (cleanContent.includes('<body') && cleanContent.includes('</body')) return cleanContent;
  if (cleanContent.length > 0) return `<!-- 未匹配到完整 HTML 片段，以下为模型原始输出 -->\n${cleanContent}`;
  throw new Error('未找到 HTML 内容');
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
  
  // 优先使用 HTML 接口（customAiService），返回后按同一套规则解析 HTML
  const useCustom = true;
  if (useCustom) {
    try {
      const raw = await generateWithCustomModel({
        prompt,
        images: request.imageBase64s,
        stream: true,
        mode: request.promptMode,
      }, {
        onStreamContent: callbacks?.onStreamContent,
        onError: callbacks?.onError,
        onComplete: callbacks?.onComplete,
      });
      return extractHtmlFromContent(raw);
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
    // 如果有图片，使用多模态格式；统一为 data:image/png;base64,<payload>，避免 data:application/octet-stream 导致 Invalid base64 image_url
    const imageContents = request.imageBase64s.map((imageBase64) => {
      let imageUrl: string;
      if (imageBase64.startsWith('data:image/')) {
        imageUrl = imageBase64;
      } else if (imageBase64.startsWith('data:') && /;base64,/.test(imageBase64)) {
        const m = imageBase64.match(/;base64,(.+)$/);
        imageUrl = `data:image/png;base64,${m ? m[1].trim() : imageBase64}`;
      } else {
        imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
      }
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

    return extractHtmlFromContent(fullContent);
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
    return extractHtmlFromContent(content);
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

