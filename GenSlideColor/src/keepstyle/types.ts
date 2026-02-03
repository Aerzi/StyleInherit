/**
 * KeepStyle 类型定义
 */

// 提示词模式
export type PromptMode = 
  | 'text'              // 纯文本模式（无图片参考）
  | 'style_extract'     // 样式提取模式（已提取的样式描述）
  | 'image_reference';  // 图片直接参考模式（关闭样式提取，直接参考图片风格）

export interface StyleExtractRequest {
  imageBase64s: string[]; // 多张图片（base64数组）
  systemPrompt?: string; // 系统提示词（可选，留空使用默认提示词）
  userPrompt?: string; // 用户输入（用户指令）
  model?: string;
}

export interface StyleExtractResult {
  styleDescription: string;
  extractedStyle: {
    colors?: string[];
    fonts?: string[];
    layout?: string;
    designElements?: string[];
  };
}

export interface GenerateRequest {
  styleDescription: string;
  systemPrompt?: string; // 系统提示词（可选，留空使用默认提示词）
  userPrompt?: string; // 用户主题/输入（用于图片生成）
  model?: string;
  imageModel?: string; // 图片生成模型（与第一阶段分开）
  outputType: 'html' | 'image' | 'both'; // 支持同时生成 HTML 和图片
  maxTokens?: number;
  imageSize?: string; // 图片尺寸，如 '1K', '2K' 等
  width?: number; // 宽度（像素）
  height?: number; // 高度（像素）
  imageBase64s?: string[]; // 图片数组（base64），用于阶段二传递图片
  htmlTemplate?: string; // HTML模板（可选，如果提供则基于模板生成）
  promptMode?: PromptMode; // 提示词模式（决定使用哪种提示词策略）
}

export interface GenerateResult {
  html?: string;
  imageUrl?: string;
  success: boolean;
  error?: string;
}

export interface GenerateCallbacks {
  onStreamContent?: (content: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
  onPromptReady?: (prompt: string) => void; // 提示词准备好后回调
}

