/**
 * ============================================
 * Excel 解析服务
 * ============================================
 * 
 * 用途：从 Excel 文件中提取浮动图片和主题文字
 * 支持格式：.xlsx, .xls
 * 
 * 依赖：xlsx 库
 */

import * as XLSX from 'xlsx';
import type { ExcelParseResult, ExcelRowItem } from './batchTypes';

/**
 * 解析 Excel 文件，提取图片和主题
 * @param file Excel 文件
 * @returns 解析结果
 */
export async function parseExcelFile(file: File): Promise<ExcelParseResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { 
      type: 'array',
      cellStyles: true,
      cellDates: true,
    });

    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 解析文字数据
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { 
      header: 1,
      defval: '' 
    }) as unknown[][];

    // 尝试提取嵌入的图片
    const images = await extractImagesFromExcel(arrayBuffer);

    // 组装结果
    const items: ExcelRowItem[] = [];
    const errors: string[] = [];

    // 跳过表头行（第一行）
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i] as unknown[];
      if (!row || row.length === 0) continue;

      // 假设第一列是主题文字
      const theme = String(row[0] || '').trim();
      if (!theme) {
        errors.push(`第 ${i + 1} 行：主题为空，已跳过`);
        continue;
      }

      // 查找对应的图片
      const imageData = images.find(img => img.rowIndex === i);
      
      if (!imageData) {
        errors.push(`第 ${i + 1} 行：未找到对应图片，已跳过`);
        continue;
      }

      items.push({
        rowIndex: i + 1, // 行号从1开始（对用户友好）
        theme,
        imageBase64: imageData.base64,
        imageName: imageData.name,
      });
    }

    return {
      success: items.length > 0,
      fileName: file.name,
      items,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    return {
      success: false,
      fileName: file.name,
      items: [],
      errors: [`解析失败: ${error instanceof Error ? error.message : '未知错误'}`],
    };
  }
}

/**
 * 图片数据结构
 */
interface ExtractedImage {
  rowIndex: number;
  base64: string;
  name: string;
  mimeType: string;
}

/**
 * 从 Excel 文件中提取嵌入的图片
 * 注意：xlsx 库对浮动图片的支持有限，可能需要使用 JSZip 直接解析
 */
async function extractImagesFromExcel(arrayBuffer: ArrayBuffer): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  
  try {
    // 动态导入 JSZip
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Excel 文件是 ZIP 格式，图片存储在 xl/media/ 目录下
    const mediaFolder = zip.folder('xl/media');
    if (!mediaFolder) {
      console.warn('未找到 xl/media 目录，Excel 中可能没有图片');
      return images;
    }

    // 尝试读取图片与单元格的关系
    const drawingRels = await parseDrawingRelationships(zip);
    const drawings = await parseDrawings(zip);

    // 提取所有图片
    const mediaFiles = Object.keys(zip.files).filter(name => 
      name.startsWith('xl/media/') && /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
    );

    for (let i = 0; i < mediaFiles.length; i++) {
      const filePath = mediaFiles[i];
      const fileName = filePath.split('/').pop() || `image_${i}`;
      const file = zip.files[filePath];
      
      if (file && !file.dir) {
        const blob = await file.async('blob');
        const base64 = await blobToBase64(blob);
        const mimeType = getMimeType(fileName);

        // 尝试从 drawings 中获取行位置
        const relId = `rId${i + 1}`;
        const drawing = drawings.find(d => d.relId === relId);
        const rowIndex = drawing?.rowIndex ?? i + 1; // 如果找不到，使用序号

        images.push({
          rowIndex,
          base64: `data:${mimeType};base64,${base64}`,
          name: fileName,
          mimeType,
        });
      }
    }

    // 如果没有从 drawings 获取到行位置，按顺序分配
    if (images.every(img => img.rowIndex === images.indexOf(img) + 1)) {
      // 按文件名排序，尝试匹配行号
      images.sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });
      images.forEach((img, idx) => {
        img.rowIndex = idx + 1;
      });
    }

    console.log(`从 Excel 中提取了 ${images.length} 张图片`, { drawingRels, drawings });
  } catch (error) {
    console.error('提取图片失败:', error);
  }

  return images;
}

/**
 * 解析 drawing 关系文件
 */
async function parseDrawingRelationships(zip: Awaited<ReturnType<typeof import('jszip')['loadAsync']>>): Promise<Map<string, string>> {
  const rels = new Map<string, string>();
  
  try {
    const relsFile = zip.files['xl/drawings/_rels/drawing1.xml.rels'];
    if (relsFile) {
      const content = await relsFile.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      const relationships = doc.querySelectorAll('Relationship');
      
      relationships.forEach(rel => {
        const id = rel.getAttribute('Id');
        const target = rel.getAttribute('Target');
        if (id && target) {
          rels.set(id, target);
        }
      });
    }
  } catch (error) {
    console.warn('解析 drawing 关系失败:', error);
  }

  return rels;
}

/**
 * 解析 drawings XML，获取图片位置
 */
interface DrawingInfo {
  relId: string;
  rowIndex: number;
  colIndex: number;
}

async function parseDrawings(zip: Awaited<ReturnType<typeof import('jszip')['loadAsync']>>): Promise<DrawingInfo[]> {
  const drawings: DrawingInfo[] = [];

  try {
    const drawingFile = zip.files['xl/drawings/drawing1.xml'];
    if (drawingFile) {
      const content = await drawingFile.async('string');
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/xml');
      
      // 查找 twoCellAnchor 元素（表示浮动图片）
      const anchors = doc.querySelectorAll('twoCellAnchor, oneCellAnchor');
      
      anchors.forEach(anchor => {
        // 获取起始行
        const fromRow = anchor.querySelector('from row');
        const rowIndex = fromRow ? parseInt(fromRow.textContent || '0') : 0;
        
        // 获取起始列
        const fromCol = anchor.querySelector('from col');
        const colIndex = fromCol ? parseInt(fromCol.textContent || '0') : 0;
        
        // 获取图片引用 ID
        const blipFill = anchor.querySelector('blipFill blip, pic blipFill blip');
        const embedAttr = blipFill?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed');
        
        if (embedAttr) {
          drawings.push({
            relId: embedAttr,
            rowIndex: rowIndex + 1, // 转换为 1-based
            colIndex: colIndex + 1,
          });
        }
      });
    }
  } catch (error) {
    console.warn('解析 drawings 失败:', error);
  }

  return drawings;
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // 移除 data:xxx;base64, 前缀
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 根据文件扩展名获取 MIME 类型
 */
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
  };
  return mimeTypes[ext || ''] || 'image/png';
}

/**
 * 验证文件是否为支持的 Excel 格式
 */
export function isValidExcelFile(file: File): boolean {
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
  ];
  const validExtensions = ['.xlsx', '.xls'];
  
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  return hasValidType || hasValidExtension;
}

/**
 * 手动匹配图片和主题
 * 当自动解析失败时，可以让用户手动上传图片文件夹
 */
export async function parseImagesFolder(files: FileList): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) continue;
    
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // 尝试从文件名提取行号
      const match = file.name.match(/(\d+)/);
      const rowIndex = match ? parseInt(match[1]) : i + 1;
      
      images.push({
        rowIndex,
        base64,
        name: file.name,
        mimeType: file.type,
      });
    } catch (error) {
      console.error(`读取图片失败: ${file.name}`, error);
    }
  }
  
  // 按行号排序
  images.sort((a, b) => a.rowIndex - b.rowIndex);
  
  return images;
}

