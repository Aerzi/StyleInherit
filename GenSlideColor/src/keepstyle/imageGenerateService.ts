/**
 * 图片生成服务
 * 参考 D:\jiazaixiang\kwppbeautify_jsaddons\src\components\AiBananaFullPpt.vue
 * 使用提交任务+轮询的方式生成图片
 */

import type { GenerateRequest, GenerateCallbacks } from './types';
import { generateWithCustomModel } from '../services/customAiService';
import { 
  IMAGE_REFERENCE_IMAGE_PROMPT,
  TEXT_ONLY_IMAGE_PROMPT,
  STYLE_EXTRACT_IMAGE_PROMPT
} from '../assets/prompts';

// 从环境变量或默认值获取配置
function getImageApiConfig() {
  return {
    apiBase: (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_IMAGE_API_BASE || 'http://10.213.47.79:3001',
    pollInterval: 1000, // 轮询间隔 1 秒
    maxPollTime: 600000, // 最大轮询时间 10 分钟
  };
}

// 图片生成 API 请求 Headers
const IMAGE_API_HEADERS = {
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Connection': 'keep-alive',
  'Content-Type': 'application/json',
  'Origin': 'http://10.213.47.79:4173',
  'Referer': 'http://10.213.47.79:4173/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0'
};

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
 * 根据 promptMode 选择不同的提示词模板
 */
function buildImagePrompt(request: GenerateRequest): string {
  const width = request.width || 3600;
  const height = request.height || 2025;
  const information = request.userPrompt || '根据设计风格生成一张专业的幻灯片图片';
  
  // 根据 promptMode 选择提示词
  const mode = request.promptMode || 'style_extract';
  
  switch (mode) {
    case 'image_reference':
      // 图片直接参考模式 - 关闭样式提取，直接参考图片
      return IMAGE_REFERENCE_IMAGE_PROMPT
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
    
    case 'text':
      // 纯文本模式 - 无图片参考
      return TEXT_ONLY_IMAGE_PROMPT
        .replace(/\{\^information\^\}/g, information)
        .replace(/\{\^width\^\}/g, String(width))
        .replace(/\{\^height\^\}/g, String(height));
    
    case 'style_extract':
    default:
      // 样式提取模式 - 使用原有提示词（包含提取的样式描述）
      return buildStyleExtractImagePrompt(request);
  }
}

/**
 * 样式提取模式的图片生成提示词
 * 使用 src/assets/prompts/image-gen-prompt.ts 中的 STYLE_EXTRACT_IMAGE_PROMPT
 */
function buildStyleExtractImagePrompt(request: GenerateRequest): string {
  const width = request.width || 3600;
  const height = request.height || 2025;
  const styleDescription = request.styleDescription || '';
  const userPrompt = request.userPrompt || '根据设计风格生成一张专业的幻灯片图片';
  
  // 如果用户提供了系统提示词，优先使用
  if (request.systemPrompt && request.systemPrompt.trim()) {
    return request.systemPrompt.trim();
  }
  
  // 使用统一管理的默认提示词
  return STYLE_EXTRACT_IMAGE_PROMPT
    .replace(/\{\^width\^\}/g, String(width))
    .replace(/\{\^height\^\}/g, String(height))
    .replace(/\{\^styleDescription\^\}/g, styleDescription)
    .replace(/\{\^userPrompt\^\}/g, userPrompt);
}

/**
 * 提交图片生成任务
 * 严格按照以下 curl 格式：
 * - Doubao: model=Doubao-image-seedream-v4.5, provider=doubao, width=3600, height=2025
 * - Gemini: model=gemini-3-pro-image-preview, provider=google, width=1024, height=1024
 */
export async function submitImageTask(
  promptText: string,
  imageSize: string,
  modelId?: string,
  width?: number,
  height?: number,
  referenceImages?: string[] // 参考图片数组（base64）
): Promise<string> {
  const config = getImageApiConfig();
  
  // 判断模型类型
  const isGemini = modelId === 'gemini-3-pro-image-preview';
  
  // 根据模型类型设置默认参数
  // Doubao: 3600x2025 (16:9), image_size=2K
  // Gemini: 1024x1024 (1:1 正方形), image_size=1K
  const defaultWidth = isGemini ? 1024 : 3600;
  const defaultHeight = isGemini ? 1024 : 2025;
  const defaultImageSize = isGemini ? '1K' : '2K';
  const provider = isGemini ? 'google' : 'doubao';
  const model = modelId || 'Doubao-image-seedream-v4.5';
  
  // 构建请求体，严格按照 curl 格式
  // Doubao: 固定使用 image_size=2K
  // Gemini: {"prompt", "image_size": "1K", "model", "provider", "width": 1024, "height": 1024}
  const body: Record<string, unknown> = {
    prompt: promptText,
    image_size: isGemini ? (imageSize || defaultImageSize) : '2K',
    model: model,
    provider: provider,
    width: width || defaultWidth,
    height: height || defaultHeight
  };
  
  // 如果有参考图片，添加 input_images（Doubao 和 Gemini 都支持）
  if (referenceImages && referenceImages.length > 0) {
    body.input_images = referenceImages.map((img) => {
      // 已是 data:image/ 则保留；否则去掉 data:application/octet-stream 等错误前缀，统一为 data:image/png;base64,<payload>
      let imageData = img;
      if (img.startsWith('data:image/')) {
        imageData = img;
      } else if (img.startsWith('data:') && /;base64,/.test(img)) {
        const base64Match = img.match(/;base64,(.+)$/);
        const payload = base64Match ? base64Match[1].trim() : img;
        imageData = `data:image/png;base64,${payload}`;
      } else {
        imageData = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
      }
      return {
        image_data: imageData
      };
    });
    console.log('[ImageAPI] 添加参考图片数量:', (body.input_images as Array<unknown>).length);
  }

  // 打印请求参数用于调试
  const inputImagesArray = body.input_images as Array<unknown> | undefined;
  console.log('[ImageAPI] 提交图片生成任务:', {
    url: `${config.apiBase}/api/image/submit`,
    model: body.model,
    provider: body.provider,
    image_size: body.image_size,
    width: body.width,
    height: body.height,
    prompt_length: (body.prompt as string)?.length,
    input_images_count: inputImagesArray?.length || 0
  });

  const response = await fetch(`${config.apiBase}/api/image/submit`, {
    method: 'POST',
    headers: IMAGE_API_HEADERS,
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log('[ImageAPI] 提交结果:', result);
  
  if (!result.success) {
    throw new Error(result.error || '提交任务失败');
  }
  return result.data.taskId;
}

// 任务状态响应类型
interface TaskStatusResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: string;
  error?: string;
  images?: Array<{ url: string }>;
}

/**
 * 查询任务状态
 * 参考 queryTaskStatus 函数
 */
async function queryTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const config = getImageApiConfig();
  const response = await fetch(`${config.apiBase}/api/image/status`, {
    method: 'POST',
    headers: IMAGE_API_HEADERS,
    body: JSON.stringify({ task_id: taskId }),
  });
  const result = await response.json();
  
  // 打印完整响应用于调试
  console.log('[ImageAPI] Status 响应:', JSON.stringify(result, null, 2));
  
  if (!result.success) {
    throw new Error(result.error || '查询状态失败');
  }
  
  // 如果状态是 failed，打印详细错误信息
  if (result.data?.status === 'failed') {
    console.error('[ImageAPI] 任务失败详情:', {
      taskId,
      error: result.data.error,
      progress: result.data.progress,
      xRequestId: result.data.xRequestId
    });
  }
  
  return result.data;
}

/**
 * 轮询获取图片生成结果
 * @param taskId 任务ID
 * @param onProgress 进度回调 (0-100)
 * @returns 生成的图片URL
 */
export async function pollForResult(
  taskId: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const config = getImageApiConfig();
  const startTime = Date.now();
  let pollCount = 0;

  while (true) {
    pollCount++;
    const elapsed = Date.now() - startTime;

    if (elapsed >= config.maxPollTime) {
      throw new Error(`生成超时（已等待 ${Math.round(elapsed / 1000)}s）`);
    }

    const status = await queryTaskStatus(taskId);
    
    // 计算进度 (0-100)
    const progress = Math.min(95, Math.floor((elapsed / config.maxPollTime) * 100));
    onProgress?.(progress);

    if (status.status === 'completed') {
      const images = status.images || [];
      if (images.length > 0 && images[0].url) {
        onProgress?.(100);
        return images[0].url;
      } else {
        throw new Error('生成完成但未返回图片URL');
      }
    }

    if (status.status === 'failed') {
      throw new Error(status.error || '生成失败');
    }

    await delay(config.pollInterval);
  }
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

  // 图片尺寸，根据模型类型设置默认值
  // Doubao: 2K (高分辨率)
  // Gemini: 1K
  const isGeminiModel = request.imageModel === 'gemini-3-pro-image-preview';
  const imageSize = request.imageSize || (isGeminiModel ? '1K' : '2K');

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
        const errorMsg = status.error || '生成失败（未返回具体错误信息）';
        callbacks?.onError?.(errorMsg);
        callbacks?.onStreamContent?.(`\n❌ 图片生成失败!\n`);
        callbacks?.onStreamContent?.(`错误信息: ${errorMsg}\n`);
        callbacks?.onStreamContent?.(`TaskId: ${taskId}\n`);
        callbacks?.onStreamContent?.(`\n请检查:\n`);
        callbacks?.onStreamContent?.(`1. prompt 内容是否合规\n`);
        callbacks?.onStreamContent?.(`2. 模型参数是否正确\n`);
        callbacks?.onStreamContent?.(`3. 服务端是否正常运行\n`);
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

