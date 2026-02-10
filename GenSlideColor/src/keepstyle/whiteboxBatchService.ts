/**
 * 批量测试服务
 * 记录每一步：原始图 -> 样式提取(文本样式) -> 图片清洗效果 -> 生成结果(HTML/图片)
 */

import JSZip from 'jszip';
import { extractStyleFromImage } from './extractStyleService';
import { cleanImage, imageUrlToBase64 } from './cleanImageService';
import { generateSlide } from './generateService';

export interface WhiteboxTaskInput {
  index: number;
  userPrompt: string;
  imageBase64: string;
  imageName?: string;
}

export interface WhiteboxConfig {
  enableStyleExtract: boolean;
  enableImageCleaning: boolean;
  outputType: 'html' | 'image' | 'both';
  /** 样式提取模型（与样式继承「选择模型」一致，如 doubao-seed-1.8） */
  extractModel?: string;
  /** HTML 生成模型（与样式继承一致，Chat 模型） */
  htmlModel?: string;
  imageModel?: string;
  imageSize?: string;
  htmlTemplate?: string;
  width?: number;
  height?: number;
  taskDelayMs?: number;
}

export interface WhiteboxStepLog {
  step: string;
  startTime: number;
  endTime?: number;
  success: boolean;
  error?: string;
  message?: string;
}

export interface WhiteboxTaskRecord {
  index: number;
  userPrompt: string;
  imageName?: string;
  steps: WhiteboxStepLog[];
  /** 原始图片 base64（用于导出） */
  originalImageBase64: string;
  /** 提取的文本样式（样式描述） */
  styleDescription?: string;
  /** 图片清洗后的 URL */
  cleanedImageUrl?: string;
  /** 图片清洗后的 base64（用于导出到 ZIP） */
  cleanedImageBase64?: string;
  /** 生成的 HTML */
  html?: string;
  /** 生成的图片 URL */
  imageUrl?: string;
  /** 生成的图片 base64（用于导出到 ZIP） */
  imageBase64?: string;
  success: boolean;
  error?: string;
}

export interface WhiteboxBatchCallbacks {
  onTaskStart?: (index: number, total: number) => void;
  onTaskStep?: (index: number, step: string, message?: string) => void;
  onTaskComplete?: (index: number, record: WhiteboxTaskRecord) => void;
  onTaskError?: (index: number, error: string) => void;
  onLog?: (line: string) => void;
}

/**
 * 执行单条任务的批量测试流程：提取样式 -> (可选)图片清洗 -> 生成
 */
export async function runWhiteboxTask(
  item: WhiteboxTaskInput,
  config: WhiteboxConfig,
  callbacks?: WhiteboxBatchCallbacks
): Promise<WhiteboxTaskRecord> {
  const steps: WhiteboxStepLog[] = [];
  const record: WhiteboxTaskRecord = {
    index: item.index,
    userPrompt: item.userPrompt,
    imageName: item.imageName,
    steps,
    originalImageBase64: item.imageBase64,
    success: false,
  };

  const log = (msg: string) => {
    callbacks?.onLog?.(`[任务${item.index}] ${msg}`);
  };

  const addStep = (step: string, success: boolean, error?: string, message?: string) => {
    const last = steps[steps.length - 1];
    if (last && !last.endTime) last.endTime = Date.now();
    steps.push({
      step,
      startTime: Date.now(),
      endTime: Date.now(),
      success,
      error,
      message,
    });
  };

  try {
    let styleDescription = '';
    let refImageBase64s: string[] = [item.imageBase64];

    // ---------- 步骤 1: 样式提取 ----------
    callbacks?.onTaskStep?.(item.index, 'extract', '正在提取样式…');
    log('步骤1: 样式提取');
    const extractStart = Date.now();
    if (config.enableStyleExtract) {
      const extractResult = await extractStyleFromImage({
        imageBase64s: [item.imageBase64],
        userPrompt: item.userPrompt,
        model: config.extractModel,
      });
      styleDescription = extractResult.styleDescription || '';
      record.styleDescription = styleDescription;
      addStep('extract', true, undefined, `提取完成，长度 ${styleDescription.length} 字符`);
      log(`步骤1 完成: 提取的文本样式长度 ${styleDescription.length} 字符`);
    } else {
      styleDescription = '';
      addStep('extract', true, undefined, '已跳过（未启用样式提取）');
      log('步骤1: 已跳过样式提取');
    }
    steps[steps.length - 1].endTime = Date.now();

    // ---------- 步骤 2: 图片清洗（可选） ----------
    if (config.enableImageCleaning && styleDescription) {
      callbacks?.onTaskStep?.(item.index, 'clean', '正在清洗图片…');
      log('步骤2: 图片清洗');
      try {
        const cleanResult = await cleanImage(
          {
            originalImageBase64: item.imageBase64,
            styleDescription,
            imageModel: config.imageModel,
            width: config.width ?? 3600,
            height: config.height ?? 2025,
          },
          {
            onProgress: (stage, p) => callbacks?.onTaskStep?.(item.index, 'clean', `${stage} ${p}%`),
          }
        );
        record.cleanedImageUrl = cleanResult.cleanedImageUrl;
        try {
          record.cleanedImageBase64 = await imageUrlToBase64(cleanResult.cleanedImageUrl);
          refImageBase64s = [record.cleanedImageBase64];
        } catch {
          refImageBase64s = [item.imageBase64];
        }
        addStep('clean', true, undefined, '清洗完成');
        log('步骤2 完成: 图片清洗效果已记录');
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        addStep('clean', false, errMsg);
        log(`步骤2 失败: ${errMsg}`);
        refImageBase64s = [item.imageBase64];
      }
      steps[steps.length - 1].endTime = Date.now();
    } else {
      addStep('clean', true, undefined, '已跳过（未启用或无样式描述）');
    }

    // ---------- 步骤 3: 生成 HTML / 图片（与样式继承一致：both 时一次请求，传 model + imageModel） ----------
    const needHtml = config.outputType === 'html' || config.outputType === 'both';
    const needImage = config.outputType === 'image' || config.outputType === 'both';
    const width = needHtml ? (config.width ?? 1280) : (config.width ?? 3600);
    const height = needHtml ? (config.height ?? 720) : (config.height ?? 2025);

    if (needHtml && needImage) {
      callbacks?.onTaskStep?.(item.index, 'generate', '正在并行生成 HTML 与图片…');
      log('步骤3: 并行生成 HTML + 图片');
      const bothResult = await generateSlide({
        styleDescription: styleDescription || '根据参考图生成幻灯片',
        userPrompt: item.userPrompt,
        outputType: 'both',
        model: config.htmlModel,
        imageModel: config.imageModel,
        imageSize: config.imageSize,
        promptMode: config.enableStyleExtract ? 'style_extract' : 'image_reference',
        htmlTemplate: config.htmlTemplate,
        imageBase64s: refImageBase64s,
        width: 1280,
        height: 720,
      });
      if (!bothResult.success) {
        addStep('generate', false, bothResult.error);
        throw new Error(bothResult.error || '生成失败');
      }
      if (bothResult.html) {
        record.html = bothResult.html;
        addStep('generate_html', true, undefined, `HTML 长度 ${bothResult.html.length} 字符`);
      }
      if (bothResult.imageUrl) {
        record.imageUrl = bothResult.imageUrl;
        try {
          record.imageBase64 = await imageUrlToBase64(bothResult.imageUrl);
        } catch {
          // 保留 URL
        }
        addStep('generate_image', true, undefined, '图片已生成');
      }
      log('步骤3 完成: HTML + 图片');
    } else if (needHtml) {
      callbacks?.onTaskStep?.(item.index, 'generate_html', '正在生成 HTML…');
      log('步骤3: 生成 HTML');
      const htmlResult = await generateSlide({
        styleDescription: styleDescription || '根据参考图生成幻灯片',
        userPrompt: item.userPrompt,
        outputType: 'html',
        model: config.htmlModel,
        promptMode: config.enableStyleExtract ? 'style_extract' : 'image_reference',
        htmlTemplate: config.htmlTemplate,
        imageBase64s: refImageBase64s,
        width,
        height,
      });
      if (htmlResult.success && htmlResult.html) {
        record.html = htmlResult.html;
        addStep('generate_html', true, undefined, `HTML 长度 ${htmlResult.html.length} 字符`);
        log('步骤3 完成: HTML 已生成');
      } else {
        addStep('generate_html', false, htmlResult.error);
        throw new Error(htmlResult.error || 'HTML 生成失败');
      }
    } else if (needImage) {
      callbacks?.onTaskStep?.(item.index, 'generate_image', '正在生成图片…');
      log('步骤3: 生成图片');
      const imageResult = await generateSlide({
        styleDescription: styleDescription || '根据参考图生成幻灯片',
        userPrompt: item.userPrompt,
        outputType: 'image',
        promptMode: config.enableStyleExtract ? 'style_extract' : 'image_reference',
        imageModel: config.imageModel,
        imageSize: config.imageSize,
        imageBase64s: refImageBase64s,
        width,
        height,
      });
      if (imageResult.success && imageResult.imageUrl) {
        record.imageUrl = imageResult.imageUrl;
        try {
          record.imageBase64 = await imageUrlToBase64(imageResult.imageUrl);
        } catch {
          // 保留 URL
        }
        addStep('generate_image', true, undefined, '图片已生成');
        log('步骤3 完成: 图片已生成');
      } else {
        addStep('generate_image', false, imageResult.error);
        throw new Error(imageResult.error || '图片生成失败');
      }
    }

    record.success = true;
    callbacks?.onTaskComplete?.(item.index, record);
    return record;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    record.success = false;
    record.error = errMsg;
    addStep('error', false, errMsg);
    log(`任务失败: ${errMsg}`);
    callbacks?.onTaskError?.(item.index, errMsg);
    return record;
  }
}

/**
 * 批量测试执行
 */
export async function runWhiteboxBatch(
  items: WhiteboxTaskInput[],
  config: WhiteboxConfig,
  callbacks?: WhiteboxBatchCallbacks
): Promise<WhiteboxTaskRecord[]> {
  const results: WhiteboxTaskRecord[] = [];
  const delay = config.taskDelayMs ?? 2000;

  for (let i = 0; i < items.length; i++) {
    callbacks?.onTaskStart?.(i + 1, items.length);
    const record = await runWhiteboxTask(items[i], config, callbacks);
    results.push(record);
    if (i < items.length - 1 && delay > 0) {
      callbacks?.onLog?.(`等待 ${delay}ms 后执行下一任务…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return results;
}

/**
 * base64 数据 URL 转二进制
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 打包批量测试记录为 ZIP：每个任务一个文件夹，内含 01_original、02_extract_style、03_cleaned、04_result 等
 */
export async function buildWhiteboxZip(
  records: WhiteboxTaskRecord[],
  _config: WhiteboxConfig
): Promise<Blob> {
  const zip = new JSZip();
  const manifest: {
    config: WhiteboxConfig;
    total: number;
    success: number;
    failed: number;
    tasks: Array<{
      index: number;
      userPrompt: string;
      success: boolean;
      error?: string;
      steps: WhiteboxStepLog[];
      hasStyle: boolean;
      hasCleaned: boolean;
      hasHtml: boolean;
      hasImage: boolean;
    }>;
  } = {
    config: _config,
    total: records.length,
    success: records.filter((r) => r.success).length,
    failed: records.filter((r) => !r.success).length,
    tasks: records.map((r) => ({
      index: r.index,
      userPrompt: r.userPrompt,
      success: r.success,
      error: r.error,
      steps: r.steps,
      hasStyle: !!r.styleDescription,
      hasCleaned: !!(r.cleanedImageUrl || r.cleanedImageBase64),
      hasHtml: !!r.html,
      hasImage: !!(r.imageUrl || r.imageBase64),
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  const readmeRoot = `批量测试结果说明
- task_001, task_002... 每个任务一个文件夹
- 03_cleaned.* = 图片清洗后的效果（去字去图表）
- 05_result.* = 最终生成的图片（AI 根据样式+主题生成的图，不是清洗图）
- 若只有 05_result_url.txt，说明图片需通过其中的 URL 在浏览器中打开查看（可能因跨域未保存为 PNG）
`;

  zip.file('README.txt', readmeRoot);

  for (const r of records) {
    const folder = `task_${String(r.index).padStart(3, '0')}`;

    // 01_original.png
    try {
      const blob = dataUrlToBlob(r.originalImageBase64);
      zip.file(`${folder}/01_original.png`, blob);
    } catch {
      zip.file(`${folder}/01_original.txt`, '[base64 解析失败]');
    }

    // 02_extract_style.txt（提取的文本样式）
    zip.file(
      `${folder}/02_extract_style.txt`,
      r.styleDescription ?? '[未执行样式提取或提取为空]'
    );

    // 03_cleaned.png（图片清洗后的效果，不是最终生成图）
    if (r.cleanedImageBase64) {
      try {
        const blob = dataUrlToBlob(r.cleanedImageBase64);
        zip.file(`${folder}/03_cleaned.png`, blob);
      } catch {
        zip.file(`${folder}/03_cleaned_url.txt`, r.cleanedImageUrl ?? '');
      }
    } else if (r.cleanedImageUrl) {
      zip.file(`${folder}/03_cleaned_url.txt`, r.cleanedImageUrl);
    } else {
      zip.file(`${folder}/03_cleaned_skip.txt`, '未执行图片清洗');
    }

    // 04_result.html（生成的 HTML）
    if (r.html) {
      zip.file(`${folder}/04_result.html`, r.html);
    }

    // 05_result.png 或 05_result_url.txt = 最终生成的图片（与 03 清洗图不同）
    if (r.imageBase64) {
      try {
        const blob = dataUrlToBlob(r.imageBase64);
        zip.file(`${folder}/05_result.png`, blob);
      } catch {
        if (r.imageUrl) {
          zip.file(
            `${folder}/05_result_url.txt`,
            `# 生成的图片 URL（因跨域未保存为 PNG，请用浏览器打开下方链接查看）\n${r.imageUrl}`
          );
        }
      }
    } else if (r.imageUrl) {
      zip.file(
        `${folder}/05_result_url.txt`,
        `# 生成的图片 URL（请用浏览器打开下方链接查看）\n${r.imageUrl}`
      );
    }

    const readmeTask = `01_original.png - 本行原始参考图
02_extract_style.txt - 提取的样式描述
03_cleaned.* - 图片清洗结果（去字去图表），不是最终生成图
04_result.html - 生成的 HTML 页面
05_result.png / 05_result_url.txt - 最终生成的图片（AI 生成，与 03 不同）
`;
    zip.file(`${folder}/README.txt`, readmeTask);

    if (r.error) {
      zip.file(`${folder}/error.txt`, r.error);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
