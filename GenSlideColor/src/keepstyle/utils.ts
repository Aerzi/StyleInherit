/**
 * KeepStyle 工具函数
 */

/** kimi-k2.5：temperature=1, max_tokens=32768；传图用 content 而非 image_url.url */
export const KIMI_K25 = 'kimi-k2.5';

export function getModelParams(
  modelId: string | undefined,
  defaults: { temperature: number; max_tokens: number }
): { temperature: number; max_tokens: number } {
  if (modelId === KIMI_K25) {
    return { temperature: 1, max_tokens: 32768 };
  }
  return defaults;
}

/** 多模态图片项：kimi-k2.5 用 { type: 'image_url', content: url }，其它用 image_url: { url } */
export function imageContentItem(
  url: string,
  modelId?: string
): { type: 'image_url'; image_url?: { url: string }; content?: string } {
  if (modelId === KIMI_K25) {
    return { type: 'image_url', content: url };
  }
  return { type: 'image_url', image_url: { url } };
}

/**
 * 将文件转换为 base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 如果已经是 data URL，直接返回；否则添加前缀
      if (result.startsWith('data:')) {
        resolve(result);
      } else {
        resolve(`data:${file.type || 'image/png'};base64,${result}`);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 将 HTML 转换为图片（使用 html2canvas）
 */
export async function htmlToImage(html: string): Promise<string> {
  const { default: html2canvas } = await import('html2canvas');
  
  // 创建临时容器
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;width:1280px;height:720px;';
  document.body.appendChild(container);
  
  // 创建 iframe 来渲染 HTML
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:1280px;height:720px;border:none;';
  container.appendChild(iframe);
  
  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error('无法访问 iframe 内容');
    }
    
    doc.open();
    doc.write(html);
    doc.close();
    
    // 等待内容加载
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // 使用 html2canvas 截图
    const canvas = await html2canvas(doc.body, {
      width: 1280,
      height: 720,
      scale: 1,
      useCORS: true,
      logging: false,
    });
    
    const dataUrl = canvas.toDataURL('image/png');
    
    // 清理
    document.body.removeChild(container);
    
    return dataUrl;
  } catch (error) {
    document.body.removeChild(container);
    throw error;
  }
}

