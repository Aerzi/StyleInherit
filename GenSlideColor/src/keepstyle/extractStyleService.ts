/**
 * 样式提取服务
 * 根据图片和提示词提取样式和风格
 */

import type { StyleExtractRequest, StyleExtractResult } from './types';
import { generateWithCustomModel } from '../services/customAiService';

// 从环境变量或默认值获取配置
function getConfig() {
  return {
    apiUrl: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_KEY || '',
    model: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MODEL_NAME || 'gpt-4o',
  };
}

const DEFAULT_EXTRACT_SYSTEM_PROMPT = `
# Role: PPT Visual DNA Decoder (PPT视觉基因解码专家)

## Profile
你是一位兼具理性逻辑与感性审美的 PPT 视觉技术总监。核心任务是将 PPT 截图转化为 HTML 渲染参数 (Spec) 与 AI 生图指令 (Desc)，重点在于**色彩体系的深度解构与演化**。

## I. 色彩演化逻辑 (Color Evolution)

1. **精准抓取**：优先从截图的 Icon、装饰线条、重点文字中提取所有出现的辅助色。
2. **智能泛化 (Augmentation)**：
   - 如果原图色调单一（< 2 种颜色）：基于主色 'background_hex'，通过调整明度(L)与饱和度(S)，生成 3-5 个**具有设计感**的辅助色（如：同色系深浅变化或互补跳色）。
   - **配色方案选择**：根据主题氛围（如科技用冷色对比，党政用暖色渐变）生成色彩矩阵。
3. **可用性检查**：确保所有生成的辅助色与文字主色保持足够的对比度，作为装饰点缀使用。

## II. 输出协议 (JSON Only)

请严格输出以下结构，确保 'color_palette' 能够直接驱动 HTML 装饰元素的颜色。

{
  "confidence_score": 0.0,
  "specs": {
    "background_hex": "#RRGGBB",
    "primary_font_color": "#RRGGBB",
    "accent_color": "#RRGGBB",
    "color_palette": [
      {"hex": "#RRGGBB", "role": "e.g. Sub-heading / Border", "usage": "点缀色用途"},
      {"hex": "#RRGGBB", "role": "e.g. Floating geometric element", "usage": "装饰元素色"},
      {"hex": "#RRGGBB", "role": "e.g. Gradient stop", "usage": "背景渐变终止色"}
    ],
    "border_radius": "0px | 8px | 20px"
  },
  "image_prompt_desc": {
    "atmosphere": "e.g. Modern high-tech minimalism",
    "lighting": "Volumetric lighting with [accent_color] tints",
    "texture": "Matte finish with micro-grain",
    "composition_guardrail": "CRITICAL: Center 70% is a pure [background_hex] sanctuary. No elements allowed.",
    "global_prompt": "A professional PPT background. Deeply minimalist. [atmosphere]. [lighting]. The palette uses [background_hex] as base, accented by [color_palette 中的所有十六进制码]. Visual interest is strictly limited to edges and corners using subtle shapes. 8K resolution, clean aesthetic."
  }
}
`;

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

