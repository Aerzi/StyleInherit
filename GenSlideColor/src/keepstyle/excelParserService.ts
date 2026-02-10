/**
 * ============================================
 * Excel 解析服务
 * ============================================
 *
 * 用途：解析Excel文件，提取图片和对应的文本主题
 * 依赖：xlsx 库（需要安装）
 *
 * 两种模式：
 * 1. 嵌入图片：第一列主题，浮动图片与行关联
 * 2. 图片名+文件夹：第一列主题，第二列图片文件名，从 imageFiles 里按文件名查找
 */

import * as XLSX from 'xlsx';
import type { ExcelRowItem } from './batchTypes';

/** 按文件名（含扩展名或不含）在文件列表里查找，不区分大小写 */
function findImageFileByName(imageFiles: File[], imageName: string): File | undefined {
  const trimmed = String(imageName || '').trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const withoutExt = lower.replace(/\.[^./]+$/, '');
  for (const f of imageFiles) {
    const n = f.name.toLowerCase();
    if (n === lower || n.replace(/\.[^./]+$/, '') === withoutExt) return f;
  }
  return undefined;
}

/**
 * 解析 Excel：第一列主题，第二列图片文件名；从 imageFiles 中按文件名找图并读成 base64
 * @param excelFile Excel 文件
 * @param imageFiles 图片文件列表（来自用户选择的「图片文件夹」多选）
 */
export async function parseExcelWithImagesFromFolder(
  excelFile: File,
  imageFiles: File[]
): Promise<ExcelRowItem[]> {
  const arrayBuffer = await excelFile.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellStyles: true,
    cellDates: true,
  });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    header: 1,
    defval: '',
  }) as unknown[][];

  const results: ExcelRowItem[] = [];
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i] as string[];
    const userPrompt = String(row[0] ?? '').trim();
    const imageFileName = row[1] != null ? String(row[1]).trim() : '';
    if (!userPrompt) continue;

    const file = imageFileName ? findImageFileByName(imageFiles, imageFileName) : undefined;
    let imageBase64 = '';
    if (file) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string) ?? '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    if (!imageBase64) continue;
    results.push({
      rowIndex: i + 1,
      theme: userPrompt,
      userPrompt,
      imageBase64,
      imageName: imageFileName || file?.name,
    });
  }
  return results;
}

/**
 * 解析Excel文件，提取嵌入的浮动图片和文本主题
 * @param file Excel文件
 * @returns 解析结果数组
 */
export async function parseExcelWithImages(file: File): Promise<ExcelRowItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          reject(new Error('文件读取失败'));
          return;
        }

        const workbook = XLSX.read(data, {
          type: 'array',
          cellStyles: true,
          cellDates: true,
        });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          header: 1,
          defval: '',
        });

        const images = await extractImagesFromExcel(file);
        const results: ExcelRowItem[] = [];

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i] as string[];
          const userPrompt = String(row[0] || '').trim();
          if (!userPrompt) continue;
          const imageBase64 = images[i - 1] || '';
          if (imageBase64) {
            results.push({
              rowIndex: i + 1,
              theme: userPrompt,
              userPrompt,
              imageBase64,
            });
          }
        }
        resolve(results);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 从Excel文件中提取嵌入图片
 * 使用JSZip解压xlsx文件获取媒体文件
 */
async function extractImagesFromExcel(file: File): Promise<string[]> {
  // 动态导入JSZip
  const JSZip = (await import('jszip')).default;
  
  const zip = new JSZip();
  const content = await file.arrayBuffer();
  const zipContent = await zip.loadAsync(content);
  
  const images: string[] = [];
  const mediaFolder = zipContent.folder('xl/media');
  
  if (!mediaFolder) {
    console.warn('Excel文件中未找到媒体文件夹');
    return images;
  }
  
  // 获取所有图片文件
  const imageFiles: { name: string; file: JSZip.JSZipObject }[] = [];
  
  mediaFolder.forEach((relativePath, file) => {
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(relativePath)) {
      imageFiles.push({ name: relativePath, file });
    }
  });
  
  // 按文件名排序（通常是 image1.png, image2.png...）
  imageFiles.sort((a, b) => {
    const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
    const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
    return numA - numB;
  });
  
  // 转换为Base64
  for (const { file } of imageFiles) {
    try {
      const blob = await file.async('blob');
      const base64 = await blobToBase64(blob);
      images.push(base64);
    } catch (error) {
      console.error('图片提取失败:', error);
    }
  }
  
  return images;
}

/**
 * Blob转Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 验证Excel文件格式
 */
export function validateExcelFile(file: File): { valid: boolean; error?: string } {
  const validExtensions = ['.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  
  if (!validExtensions.some(ext => fileName.endsWith(ext))) {
    return { valid: false, error: '请上传Excel文件（.xlsx或.xls）' };
  }
  
  // 文件大小限制（50MB）
  if (file.size > 50 * 1024 * 1024) {
    return { valid: false, error: '文件大小不能超过50MB' };
  }
  
  return { valid: true };
}

/**
 * 获取Excel预览信息
 */
export async function getExcelPreview(file: File): Promise<{
  totalRows: number;
  imageCount: number;
  sampleData: { rowIndex: number; prompt: string; hasImage: boolean }[];
}> {
  const parsed = await parseExcelWithImages(file);
  
  return {
    totalRows: parsed.length,
    imageCount: parsed.filter(item => item.imageBase64).length,
    sampleData: parsed.slice(0, 5).map(item => ({
      rowIndex: item.rowIndex,
      prompt: item.userPrompt.substring(0, 50) + (item.userPrompt.length > 50 ? '...' : ''),
      hasImage: !!item.imageBase64,
    })),
  };
}

