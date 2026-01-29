/**
 * 样式提取服务
 * 根据图片和提示词提取样式和风格
 */

import type { StyleExtractRequest, StyleExtractResult } from './types';
import { generateWithCustomModel } from '../services/customAiService';

// 从环境变量或默认值获取配置
function getConfig() {
  return {
    apiUrl: (import.meta as any).env?.VITE_API_BASE_URL || 'https://api.openai.com/v1',
    apiKey: (import.meta as any).env?.VITE_API_KEY || '',
    model: (import.meta as any).env?.VITE_MODEL_NAME || 'gpt-4o',
  };
}

const DEFAULT_EXTRACT_SYSTEM_PROMPT = `
# Role: PPT Visual DNA Decoder (PPT视觉基因解码专家)

## Profile
你是一位追求视觉叙事一致性的 PPT 艺术总监。你的任务是深入解构样张的“视觉灵魂”，通过提取核心色彩、字体基因与氛围调性，确保生成的 HTML 样式与背景图在风格、情绪与工程可用性上达成完美统一。

## I. 视觉解码三大核心原则

1. **色彩体系的“同源性” (Genetic Consistency)**:
   - **核心提取**：仅提取背景色、文本色、强调色这 3 个灵魂色，摒弃干扰杂色。
   - **色彩泛化**：若需增加层次，必须严格锁定色相($\Delta H=0$)，仅在明度与饱和度上进行微调，确保所有色彩均来自同一家族。

2. **可读性的“绝对值” (Contrast Priority)**:
   - **强制纠偏**：必须确保背景与文字对比度满足视觉传达要求。
   - *策略*：若深绿背景配浅绿文字，必须强制将文字修正为纯白(#FFFFFF)或极简浅灰。
   - **标记**：在输出中明确标识是否执行了“对比度修复”。

3. **氛围与风格的“连贯性” (Stylistic Cohesion)**:
   - **风格定义**：通过样张判断风格类型（如：极简、现代、专业、稳重）。
   - **氛围锁定**：生成的背景图必须是 HTML 内容的“情绪延伸”。如果原稿是白底黑字，美化应仅限于纸质质感或微弱投影，严禁添加破坏氛围的炫彩元素。

## II. 构图禁令 (Composition Shield)
- **中心禁飞区**：背景图中心 70% 区域必须为绝对纯净的单色。
- **视觉锚定**：所有的装饰性纹理、光效、几何元素必须被推向画面边缘或四角，作为侧应，绝不喧宾夺主。

## III. 结构化输出协议 (JSON Only)

{
  "confidence_score": 0.0,
  "overall_style_identity": "一句话描述该PPT的视觉设计风格与整体氛围感",
  "specs": {
    "background_hex": "#RRGGBB",
    "primary_font_color": "#RRGGBB", 
    "accent_color": "#RRGGBB",
    "extended_palette": [
      { "hex": "#RRGGBB", "usage": "同色系边缘点缀" }
    ],
    "font_family_category": "Serif | Sans-serif",
    "is_contrast_fixed": true/false 
  },
  "image_prompt_desc": {
    "atmosphere_vibe": "深入描述原稿的氛围感，如：冷静学术、高端商务、轻量极简",
    "lighting_and_texture": "描述光影与质感，如：哑光磨砂、微弱纸感、柔和漫反射",
    "color_strategy": "严格基于 [background_hex] 的同色系演化，禁止引入新色相",
    "composition_guardrail": "CRITICAL: The central 70% must be a flat [background_hex] sanctuary. No artifacts allowed in the middle.",
    "global_prompt": "A professional [atmosphere_vibe] PPT background. Masterfully minimalist. Main color is [background_hex]. Use [extended_palette] for subtle, high-end [lighting_and_texture] only at the very edges. 70% center is empty and clean for text placement. 8K, cinematic balance."
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
  const config = getConfig();

  if (!config.apiKey) {
    const error = '未配置 API Key，请在环境变量中设置 VITE_API_KEY';
    callbacks?.onError?.(error);
    throw new Error(error);
  }

  // 如果用户提供了系统提示词，则完全使用用户提供的（全替换）
  // 如果用户没有提供，则使用默认提示词 + 固定的分析任务部分
  let prompt: string;
  
  if (request.systemPrompt && request.systemPrompt.trim()) {
    // 用户提供了系统提示词，直接使用，不再添加任何固定内容
    // 如果提示词中包含 {^input^}，则替换为用户输入
    let userPrompt = request.userPrompt?.trim() || '';
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

  // 优先使用 customAiService
  const useThinking = true;
  if (useThinking) {
      try {
          // 修正模型名称：前端使用的是小写 doubao-seed-1.8，但 API 可能需要 Doubao-Seed-1.8
          // HTML生成成功是因为没有传 model 从而使用了 customAiService 默认的 Doubao-Seed-1.8
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
          // 失败则继续执行下面的逻辑
      }
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
