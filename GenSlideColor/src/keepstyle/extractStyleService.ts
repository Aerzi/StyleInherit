/**
 * 样式提取服务
 * 根据图片和提示词提取样式和风格
 */

import type { StyleExtractRequest, StyleExtractResult } from './types';
import { generateWithCustomModel } from '../services/customAiService';
import { STYLE_EXTRACT_PROMPT } from '../assets/prompts';

// 从环境变量或默认值获取配置
function getConfig() {
  return {
    apiUrl: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_KEY || '',
    model: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_NAME || 'gpt-4o',
  };
}

// 使用统一管理的提示词
const DEFAULT_EXTRACT_SYSTEM_PROMPT = STYLE_EXTRACT_PROMPT;

/**
 * 提取图片样式
 */
export async function extractStyleFromImage(
  request: StyleExtractRequest,
  callbacks?: {
    onStreamContent?: (content: string) => void;
    onError?: (error: string) => void;
    onPromptReady?: (prompt: string) => void; // 提示词准备好后回调
  }
): Promise<StyleExtractResult> {
  // 如果用户提供了系统提示词，则完全使用用户提供的（全替换）
  // 如果用户没有提供，则使用默认提示词 + 固定的分析任务部分
  let prompt: string;
  
  if (request.systemPrompt && request.systemPrompt.trim()) {
    // 用户提供了系统提示词，直接使用，不再添加任何固定内容
    // 如果提示词中包含 {^input^}，则替换为用户输入
    const userPrompt = request.userPrompt?.trim() || '';
    prompt = request.systemPrompt.trim().replace(/\{\^input\^\}/g, userPrompt);
  } else {
    // 用户没有提供系统提示词，使用默认提示词
    const systemPrompt = DEFAULT_EXTRACT_SYSTEM_PROMPT;
    // 用户输入（如果有）
    const userInput = request.userPrompt?.trim() || '';
    
    // 替换提示词中的 {^input^} 占位符
    prompt = systemPrompt.replace(/\{\^input\^\}/g, userInput);
  }

  // 通知提示词已准备好
  callbacks?.onPromptReady?.(prompt);

  // 优先使用 customAiService（Doubao-Seed-1.8）
  try {
    // 修正模型名称：前端使用的是小写 doubao-seed-1.8，但 API 需要 Doubao-Seed-1.8
    let modelName = request.model;
    if (modelName === 'doubao-seed-1.8') {
      modelName = 'Doubao-Seed-1.8';
    }

    const fullContent = await generateWithCustomModel({
      prompt: prompt,
      images: request.imageBase64s,
      stream: true,
      model: modelName // 传递修正后的模型名称
    }, {
      onStreamContent: callbacks?.onStreamContent,
      onError: callbacks?.onError
    });
    
    return {
      styleDescription: fullContent,
      extractedStyle: {}
    };
  } catch (e) {
    console.error('CustomService 提取样式调用失败，尝试回退到标准逻辑', e);
    // 失败则继续执行下面的回退逻辑
  }

  // 回退逻辑：使用环境变量配置的 API
  const config = getConfig();

  if (!config.apiKey) {
    const error = '未配置 API Key，请在环境变量中设置 VITE_API_KEY';
    callbacks?.onError?.(error);
    throw new Error(error);
  }

  // 构建多模态消息 - 支持多张图片
  const imageContents = request.imageBase64s.map((imageBase64) => {
    const imageUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;
    return {
      type: 'image_url' as const,
      image_url: { url: imageUrl },
    };
  });

  const messages = [
    {
      role: 'user' as const,
      content: [
        ...imageContents,
        {
          type: 'text' as const,
          text: prompt,
        },
      ],
    },
  ];

  try {
    // 使用流式响应
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || config.model,
        messages,
        temperature: 0.3,
        max_tokens: 65535,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      const error = `提取样式失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
      callbacks?.onError?.(error);
      throw new Error(error);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

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

    // 直接返回流式输出的完整内容，不进行JSON校验和解析
    const result: StyleExtractResult = {
      styleDescription: fullContent, // 直接使用完整的流式输出内容
      extractedStyle: {} // 保留结构，但不再解析
    };

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errMsg);
    throw error;
  }
}

