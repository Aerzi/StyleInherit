import { generateWithCustomModel } from '../services/customAiService';

export interface AuditResult {
  matchScore: number;
  geneTable: {
    backgroundColor: string;
    accentColor: string;
    fontColor: string;
    materialTexture: string;
    layout: string;
  };
  exportAdvice: string;
}

export async function performPPTAudit(
  originalImageBase64: string, 
  generatedImageBase64: string,
  model?: string
): Promise<AuditResult> {
  const systemInstruction = `你是一位世界顶级的“PPT视觉总监”。你的任务是根据《PPT视觉基因提取协议 (V6.2)》对比两张图片。
  
  协议核心维度：
  1. [60%-70% 中心禁区]：忽略此区域的文字内容差异，只比对背景纯度（如噪点、渐变平滑度）。
  2. [边缘装饰锚点]：对比底纹、几何体在四个角落和出血位的布局、尺寸、颜色一致性。
  3. [极端场景处理]：如果背景对比度极低，审计字体色是否通过明度对冲（极黑/极白）保证了可读性。
  4. [材质与物理特性]：比对圆角半径、毛玻璃透明度、投影深度（模糊半径及颜色）的参数化差异。

  请分析这两张PPT图片，第一张为基准图（Original），第二张为生成图（Generated）。根据协议给出对比报告。

  请严格返回如下 JSON 格式，不要包含 markdown 标记：
  {
    "matchScore": 0-100之间的整数,
    "geneTable": {
      "backgroundColor": "简短描述背景一致性",
      "accentColor": "简短描述强调色一致性",
      "fontColor": "简短描述字体颜色一致性",
      "materialTexture": "简短描述材质纹理一致性",
      "layout": "简短描述布局锚点一致性"
    },
    "exportAdvice": "具体的修改建议，200字以内"
  }`;

  const request = {
    prompt: systemInstruction,
    images: [originalImageBase64, generatedImageBase64], // 第一张基准，第二张生成
    model: model || 'Doubao-Seed-1.8', // 默认使用视觉能力较强的模型
    stream: false
  };

  try {
    const resultText = await generateWithCustomModel(request);
    
    // 清理可能存在的 markdown 标记
    const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const result = JSON.parse(cleanedText);
    return result as AuditResult;
  } catch (error) {
    console.error('PPT Audit failed:', error);
    throw new Error('样式对比分析失败，请重试');
  }
}

