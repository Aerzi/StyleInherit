import type { SlideResult } from './llmService';
import { INTENT_RECOGNITION_PROMPT } from '../assets/prompts/intent-prompt';
import { HTML_GENERATION_SYSTEM_PROMPT } from '../assets/prompts/html-gen-prompt';
import type { PromptMode } from '../keepstyle/types';

const API_CONFIG = {
  url: 'http://10.213.47.79:1234/v1/chat/completions',
  key: '{BB949A92-3A7E-4850-B544-355E39048B24}',
  model: 'Doubao-Seed-1.8'
};

export interface CustomModelRequest {
  prompt: string;
  images?: string[]; // Base64 strings or URLs
  stream?: boolean;
  model?: string;
  // 增加 mode 字段以便区分提示词模式
  mode?: PromptMode;
}

export interface CustomModelCallbacks {
  onStreamContent?: (content: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  onSlideGenerated?: (slide: SlideResult) => void;
}

export interface IntentQuestion {
  id: string;
  text: string;
  description?: string;
  type: 'radio' | 'checkbox' | 'text';
  options?: string[];
  default?: string | string[];
}

export interface IntentResponse {
  questions: IntentQuestion[];
}

/**
 * Generate intent clarification questions based on user prompt
 */
export async function generateIntentQuestions(
  userPrompt: string,
  images?: string[],
  callbacks?: CustomModelCallbacks
): Promise<IntentResponse> {
  const messages: any[] = [];
  
  const systemMessage = { role: 'system', content: INTENT_RECOGNITION_PROMPT };
  messages.push(systemMessage);

  if (images && images.length > 0) {
    const content: any[] = [{ type: 'text', text: `用户输入的主题是：${userPrompt}` }];
    
    images.forEach(img => {
      // Ensure base64 prefix if missing and not a URL
      let url = img;
      if (!img.startsWith('http') && !img.startsWith('data:')) {
        url = `data:image/png;base64,${img}`;
      }
      
      content.push({
        type: 'image_url',
        image_url: { url }
      });
    });
    
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: `用户输入的主题是：${userPrompt}` });
  }

  try {
    const response = await fetch(API_CONFIG.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.key}`
      },
      body: JSON.stringify({
        model: API_CONFIG.model,
        messages,
        temperature: 0.5, // Slightly higher for creativity in questions
        max_tokens: 2000,
        stream: false // We need full JSON at once
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content || '';

    // Clean up markdown code blocks if present
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch (e) {
      console.error('Failed to parse intent JSON', content);
      throw new Error('Failed to parse intent questions');
    }

  } catch (error: any) {
    const msg = error.message || 'Intent recognition failed';
    callbacks?.onError?.(msg);
    throw error;
  }
}

/**
 * Call the custom AI model (Doubao-Seed-1.8)
 */
export async function generateWithCustomModel(
  request: CustomModelRequest,
  callbacks?: CustomModelCallbacks
): Promise<string> {
  const messages: any[] = [];
  
  // 1. Determine Input Mode
  const hasImages = request.images && request.images.length > 0;
  
  // 2. Construct Messages based on Mode
  // Mode 1: Pure Image (Image provided, Text is minimal/default)
  // Mode 2: Pure Text (No images)
  // Mode 3: Image + Text (Both provided)
  
  // 注意：request.prompt 往往包含了系统提示词和用户输入。
  // 我们主要根据 hasImages 来区分是否为多模态。
  
  if (hasImages) {
    // Image + Text OR Pure Image (treated as multimodal with prompt)
    const content: any[] = [];
    // 统一为 data:image/png;base64,<payload>，避免 data:application/octet-stream 导致 Invalid base64 image_url
    request.images!.forEach(img => {
      let url = img;
      if (url.startsWith('http')) {
        // 保持 URL 不变
      } else if (url.startsWith('data:image/')) {
        url = url;
      } else if (url.startsWith('data:') && /;base64,/.test(url)) {
        const m = url.match(/;base64,(.+)$/);
        url = `data:image/png;base64,${m ? m[1].trim() : url}`;
      } else {
        url = url.startsWith('data:') ? url : `data:image/png;base64,${url}`;
      }
      content.push({
        type: 'image_url',
        image_url: { url }
      });
    });

    // 添加文本提示词
    // 如果是"纯图片"模式（即用户没输入啥），prompt 可能是自动生成的通用提示词。
    // 我们总是附加 prompt，因为它是指令。
    content.push({ type: 'text', text: request.prompt });
    
    messages.push({ role: 'user', content });
  } else {
    // Pure Text
    messages.push({ role: 'user', content: request.prompt });
  }

  try {
    const response = await fetch(API_CONFIG.url, {
      method: 'POST',
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Authorization': `Bearer ${API_CONFIG.key}`,
        'Connection': 'keep-alive',
        'Content-Type': 'application/json',
        'Origin': 'http://10.213.45.13:5176',
        'Referer': 'http://10.213.45.13:5176/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        model: request.model || API_CONFIG.model,
        messages,
        temperature: 0.2,
        max_tokens: 65536,
        stream: request.stream ?? true
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    if (request.stream ?? true) {
      return await handleStream(response, callbacks);
    } else {
      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      callbacks?.onComplete?.();
      return content;
    }

  } catch (error: any) {
    const msg = error.message || 'Unknown error';
    callbacks?.onError?.(msg);
    throw error;
  }
}

async function handleStream(response: Response, callbacks?: CustomModelCallbacks): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Cannot read response stream');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let slidesFound = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          const data = line.trim().slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              callbacks?.onStreamContent?.(fullContent);

              // Check for completed slides in real-time
              const slides = parseSlides(fullContent, slidesFound);
              if (slides.length > 0) {
                slides.forEach(slide => {
                    callbacks?.onSlideGenerated?.(slide);
                });
                slidesFound += slides.length;
              }
            }
          } catch (e) {
            // ignore parse errors for partial chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks?.onComplete?.();
  return fullContent;
}

function parseSlides(content: string, startIndex: number): SlideResult[] {
    const slides: SlideResult[] = [];
    // Only match fully completed slides
    const regex = /===SLIDE_START===([\s\S]*?)===SLIDE_END===/g;
    let match;
    
    // We need to skip already found slides. 
    // A simple way is to match all and slice, but regex.exec is stateful if global.
    // However, we are re-scanning fullContent every time. 
    // Optimization: logic to scan only new part could be complex. 
    // Here we just re-scan and ignore indices < startIndex.
    
    let currentIndex = 0;
    while ((match = regex.exec(content)) !== null) {
        if (currentIndex >= startIndex) {
            const html = match[1].trim();
            if (html) {
                slides.push({
                    index: currentIndex, // absolute index
                    html,
                    title: extractTitle(html)
                });
            }
        }
        currentIndex++;
    }

    return slides;
}

function extractTitle(html: string): string | undefined {
    const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    return match?.[1]?.trim();
}

