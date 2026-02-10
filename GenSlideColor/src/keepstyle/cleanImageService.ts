/**
 * 图片清洗服务
 * 根据样式提取结果，生成一张去除噪点（文字、图表等内容）的干净背景图片
 */

import { submitImageTask, pollForResult } from './imageGenerateService';
import { CLEAN_IMAGE_PROMPT } from '../assets/prompts';

export interface CleanImageRequest {
  /** 原始图片的 base64 */
  originalImageBase64: string;
  /** 样式提取的描述文本 */
  styleDescription: string;
  /** 图片生成模型 */
  imageModel?: string;
  /** 输出尺寸 */
  width?: number;
  height?: number;
}

export interface CleanImageResult {
  /** 清洗后的图片 URL */
  cleanedImageUrl: string;
  /** 清洗后的图片 base64（如果可用） */
  cleanedImageBase64?: string;
}

export interface CleanImageCallbacks {
  onProgress?: (stage: string, progress: number) => void;
  onError?: (error: string) => void;
}

/**
 * 构建清洗图片的提示词
 */
function buildCleanImagePrompt(styleDescription: string): string {
  // 使用统一管理的提示词
  return CLEAN_IMAGE_PROMPT
    .replace(/\{\^styleDescription\^\}/g, styleDescription)
    .replace(/\{styleDescription\}/g, styleDescription);
}

/**
 * 清洗图片 - 生成去除噪点的干净背景
 */
export async function cleanImage(
  request: CleanImageRequest,
  callbacks?: CleanImageCallbacks
): Promise<CleanImageResult> {
  const {
    originalImageBase64,
    styleDescription,
    imageModel = 'Doubao-image-seedream-v4.5',
    width = 3600,
    height = 2025,
  } = request;

  try {
    callbacks?.onProgress?.('构建提示词', 10);

    // 构建清洗提示词
    const prompt = buildCleanImagePrompt(styleDescription);

    callbacks?.onProgress?.('提交图片生成任务', 20);

    // 判断模型类型
    const isGemini = imageModel === 'gemini-3-pro-image-preview';
    const actualWidth = isGemini ? 1024 : width;
    const actualHeight = isGemini ? 1024 : height;
    const imageSize = isGemini ? '1K' : '2K';

    // 提交图片生成任务
    const taskId = await submitImageTask(
      prompt,
      imageSize,
      imageModel,
      actualWidth,
      actualHeight,
      [originalImageBase64] // 传入原始图片作为参考
    );

    callbacks?.onProgress?.('等待图片生成', 40);

    // 轮询获取结果
    const imageUrl = await pollForResult(taskId, (progress) => {
      // 映射进度: 40-90
      const mappedProgress = 40 + Math.floor(progress * 0.5);
      callbacks?.onProgress?.('生成中', mappedProgress);
    });

    callbacks?.onProgress?.('清洗完成', 100);

    return {
      cleanedImageUrl: imageUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    callbacks?.onError?.(errorMessage);
    throw error;
  }
}

/**
 * 将图片 URL 转换为 base64
 */
export async function imageUrlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('图片转 base64 失败:', error);
    throw error;
  }
}


