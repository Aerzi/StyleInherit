/**
 * ============================================
 * 提示词统一管理模块
 * ============================================
 * 
 * 目录结构：
 * - style-extract-prompt.ts    样式提取提示词
 * - html-gen-prompt.ts         HTML 生成提示词（样式提取模式）
 * - image-gen-prompt.ts        图片生成提示词（样式提取模式）
 * - image-reference-prompt.ts  图片直接参考模式提示词
 * - template-prompt.ts         模板参考提示词片段
 * - intent-prompt.ts           意图识别提示词
 * 
 * 使用方式：
 * import { STYLE_EXTRACT_PROMPT } from '@/assets/prompts';
 * 
 * 占位符说明：
 * - {^information^}  用户输入的主题内容
 * - {^slideStyle^}   提取的样式描述
 * - {^width^}        页面宽度（如 1280）
 * - {^height^}       页面高度（如 720）
 * - {^input^}        用户输入（通用）
 */

// 样式提取
export { STYLE_EXTRACT_PROMPT } from './style-extract-prompt';

// HTML 生成（样式提取模式）
export { STYLE_EXTRACT_HTML_PROMPT } from './html-gen-prompt';

// 图片生成（样式提取模式）
export { STYLE_EXTRACT_IMAGE_PROMPT } from './image-gen-prompt';

// 图片直接参考模式 & 纯文本模式
export { 
  IMAGE_REFERENCE_HTML_PROMPT,
  IMAGE_REFERENCE_IMAGE_PROMPT,
  TEXT_ONLY_HTML_PROMPT,
  TEXT_ONLY_IMAGE_PROMPT
} from './image-reference-prompt';

// 模板参考提示词片段
export { 
  TEMPLATE_REFERENCE_PROMPT,
  TEMPLATE_STRICT_RULES_PROMPT
} from './template-prompt';

// 意图识别
export { INTENT_RECOGNITION_PROMPT } from './intent-prompt';

