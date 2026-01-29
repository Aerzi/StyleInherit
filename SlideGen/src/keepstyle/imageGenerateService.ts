/**
 * 图片生成服务
 * 参考 D:\jiazaixiang\kwppbeautify_jsaddons\src\components\AiBananaFullPpt.vue
 * 使用提交任务+轮询的方式生成图片
 */

import type { GenerateRequest, GenerateCallbacks } from './types';
import { generateWithCustomModel } from '../services/customAiService';

// 从环境变量或默认值获取配置
function getImageApiConfig() {
  return {
    apiBase: (import.meta as any).env?.VITE_IMAGE_API_BASE || 'http://10.213.47.79:3001',
    pollInterval: 1000, // 轮询间隔 1 秒
    maxPollTime: 600000, // 最大轮询时间 10 分钟
  };
}

/**
 * 获取图片生成模型列表
 * 固定返回两个模型选项
 */
export async function fetchImageModels(): Promise<Array<{ id: string; provider: string }>> {
  // 返回固定的模型列表
  return [
    {
      id: 'Doubao-image-seedream-v4.5',
      provider: 'doubao',
    },
    {
      id: 'gemini-3-pro-image-preview',
      provider: 'google',
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 构建图片生成提示词
 * 结合样式描述和用户主题
 */
function buildImagePrompt(request: GenerateRequest): string {
  // 如果用户提供了系统提示词，则完全使用用户提供的（全替换）
  // 如果用户没有提供，则使用默认提示词 + 固定的任务说明
  let prompt: string;
  
  if (request.systemPrompt && request.systemPrompt.trim()) {
    // 用户提供了系统提示词，直接使用，不再添加任何固定内容
    prompt = request.systemPrompt.trim();
  } else {
    // 用户没有提供系统提示词，使用默认提示词 + 固定任务说明
    const systemPrompt = '你是世界一流的演示文稿设计师。请根据提取的设计风格和用户主题，生成一张高质量的幻灯片图片。';
    
    // 获取尺寸，固定为 3600x2025
    const width = request.width || 3600;
    const height = request.height || 2025;

    prompt = `${systemPrompt}

## 核心要求
- 只生成一张图片，尺寸为 16:9 比例（${width}x${height}）
- 必须全屏，不得有任何白边
- 严格遵循提取的设计风格中的 Desc 部分（材质、光影、氛围描述）
- 如果风格描述中包含复杂纹理或特殊材质，请准确还原

## 设计限制
- 禁止使用：霓虹灯效果、发光效果、立体效果、3D效果、蓝紫色系
- 禁止使用：渐变、阴影（除非风格描述中明确要求）
- **不得在图片中包含具体色值描述文字**（如不要在图片上显示 "#2d3748" 这样的色值代码）
- 不得包含具体人名、联系方式、网站、二维码等个人信息

## 布局要求
- 布局方式要丰富多样，避免单调
- 文字清晰可读，排版美观
- 专业、现代的设计风格
- 基于风格描述的详细布局要求：包括大的版式，每一块的内容组织方式
- 布局方式尽可能丰富多样，不要使用单调重复的布局

## 提取的设计风格（必须严格遵循）
${request.styleDescription}

**重要说明**：
- 上述风格描述包含两部分：Spec（规格参数，包含 HEX 色值、尺寸等）和 Desc（描述信息，包含材质、光影、氛围等）
- 请严格按照 Desc 部分生成画面，使用 Spec 部分提供的颜色值
- 确保生成的图片与提取的风格完全一致

## 用户主题
${request.userPrompt || '根据设计风格生成一张专业的幻灯片图片'}

## 输出要求
- 尺寸：${width}x${height}（16:9 比例）
- 全屏设计，无白边
- 严格遵循提取的设计风格
- 高质量、专业、现代的设计
- 清晰可读的文字内容`;
  }
  
  return prompt;
}

/**
 * 提交图片生成任务
 * 参考 submitImageTask 函数
 */
async function submitImageTask(
  promptText: string,
  imageSize: string,
  modelId?: string,
  width?: number,
  height?: number,
  referenceImages?: string[] // 参考图片数组（base64）
): Promise<string> {
  const config = getImageApiConfig();
  const body: any = {
    prompt: promptText,
    image_size: imageSize,
  };
  
  // 添加 width 和 height 到请求体
  // 注意：Doubao 模型不支持自定义 width/height 参数，会报错 ModelParamsError
  // 仅对非 Doubao 模型传递这些参数，或者当确实需要传递时才传递
  // 这里暂时对 Doubao 模型屏蔽 width/height
  const isDoubao = modelId === 'Doubao-image-seedream-v4.5';
  
  if (!isDoubao) {
    if (width !== undefined) {
      body.width = width;
    }
    if (height !== undefined) {
      body.height = height;
    }
  }

  // 如果指定了模型ID，添加到请求中
  if (modelId) {
    body.model = modelId;
    // 根据模型ID确定provider
    if (modelId === 'Doubao-image-seedream-v4.5') {
      body.provider = 'doubao';
      // 确保模型名称完全匹配用户要求
      body.model = 'Doubao-image-seedream-v4.5';
    } else if (modelId === 'gemini-3-pro-image-preview') {
      body.provider = 'google';
    }
  }

  // 如果有参考图片，添加到请求体中
  if (referenceImages && referenceImages.length > 0) {
    body.input_images = referenceImages.map((img) => ({
      image_data: img
    }));
  }

  const response = await fetch(`${config.apiBase}/api/image/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || '提交任务失败');
  }
  return result.data.taskId;
}

/**
 * 查询任务状态
 * 参考 queryTaskStatus 函数
 */
async function queryTaskStatus(taskId: string): Promise<any> {
  const config = getImageApiConfig();
  const response = await fetch(`${config.apiBase}/api/image/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || '查询状态失败');
  }
  return result.data;
}

/**
 * 生成图片（通过提交任务+轮询）
 * 参考 generatePlaygroundImage 函数
 */
export async function generateImageByApi(
  request: GenerateRequest,
  callbacks?: GenerateCallbacks
): Promise<string> {
  const config = getImageApiConfig();
  const prompt = buildImagePrompt(request);

  // 通知提示词已准备好
  callbacks?.onPromptReady?.(prompt);

  // 优先使用 customAiService
  // 用户指示：使用 customService，只需修改模型名
  // 注意：Doubao-image-seedream-v4.5 是图片生成模型，不能通过 Chat Completion 接口调用
  // 必须使用 submitImageTask 接口
  const useThinking = false;
  if (useThinking) {
      try {
        callbacks?.onStreamContent?.('正在调用 CustomService 生成图片...\n');
        
        const content = await generateWithCustomModel({
            prompt: prompt,
            images: request.imageBase64s, // 如果有参考图
            stream: true,
            model: request.imageModel || 'Doubao-image-seedream-v4.5' // 使用指定的图片模型
        }, {
            onStreamContent: (chunk) => {
                callbacks?.onStreamContent?.(chunk);
            },
            onError: callbacks?.onError
        });

        // 假设返回的内容包含图片URL，或者就是URL
        // 如果返回的是 markdown 图片格式 ![image](url)，尝试提取
        const urlMatch = content.match(/\((https?:\/\/[^)]+)\)/) || content.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
            const url = urlMatch[1] || urlMatch[0];
            callbacks?.onStreamContent?.(`\n✅ 图片生成完成: ${url}\n`);
            return url;
        }
        
        // 如果没有明显的URL，可能返回的就是内容本身（如果CustomService做了特殊处理）
        // 或者它失败了返回了错误文本
        if (content.startsWith('http')) {
             callbacks?.onStreamContent?.(`\n✅ 图片生成完成: ${content}\n`);
             return content;
        }

        throw new Error('未从返回内容中提取到有效的图片URL: ' + content.substring(0, 100) + '...');
        
      } catch (e) {
          console.error('CustomService 图片生成调用失败，尝试回退到旧接口', e);
          callbacks?.onStreamContent?.(`\n⚠️ CustomService调用失败: ${e}，尝试回退...\n`);
          // 失败则继续执行下面的旧逻辑
      }
  }

  // 图片尺寸，默认为 1K
  const imageSize = request.imageSize || '1K';

  try {
    // 准备参考图片（如果有）
    let referenceImages: string[] | undefined = undefined;
    if (request.imageBase64s && request.imageBase64s.length > 0) {
      // 将 base64 图片转换为 API 需要的格式（保留 data:image/...;base64, 前缀）
      referenceImages = request.imageBase64s.map((img) => {
        // 直接返回原始图片数据，保留前缀
        return img;
      });
    }
    
    callbacks?.onStreamContent?.('正在提交图片生成任务...\n');
    const taskId = await submitImageTask(
      prompt,
      imageSize,
      request.imageModel, // 传递模型ID
      request.width, // 传递宽度
      request.height, // 传递高度
      referenceImages // 传递参考图片
    );
    callbacks?.onStreamContent?.(`任务已提交，taskId: ${taskId}\n`);

    const startTime = Date.now();
    let pollCount = 0;

    // 轮询查询状态
    while (true) {
      pollCount++;
      const elapsed = Date.now() - startTime;

      if (elapsed >= config.maxPollTime) {
        throw new Error(`生成超时（已等待 ${Math.round(elapsed / 1000)}s）`);
      }

      const status = await queryTaskStatus(taskId);
      const elapsedSeconds = Math.round(elapsed / 1000);
      callbacks?.onStreamContent?.(
        `[${pollCount}次查询] (${elapsedSeconds}s) ${status.status} ${status.progress || ''}\n`
      );

      if (status.status === 'completed') {
        // 生成完成，返回图片URL
        const images = status.images || [];
        if (images.length > 0 && images[0].url) {
          callbacks?.onStreamContent?.('✅ 图片生成完成！\n');
          callbacks?.onComplete?.();
          return images[0].url;
        } else {
          throw new Error('生成完成但未返回图片URL');
        }
      }

      if (status.status === 'failed') {
        const errorMsg = status.error || '生成失败';
        callbacks?.onError?.(errorMsg);
        callbacks?.onStreamContent?.(`❌ 生成失败: ${errorMsg}\n`);
        throw new Error(errorMsg);
      }

      // 等待后继续轮询
      await delay(config.pollInterval);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errMsg);
    callbacks?.onStreamContent?.(`❌ 错误: ${errMsg}\n`);
    throw error;
  }
}
