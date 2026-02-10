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

/** 两张候选图相对于参考图的打分结果 */
export interface TwoCandidateScoreResult {
  scoreA: number;
  scoreB: number;
  reasonA?: string;
  reasonB?: string;
  error?: string;
}

/**
 * 根据参考图，对两张「根据样式生成的 PPT 图」分别打分（0-100）
 * 传参顺序：参考图、候选图A、候选图B
 */
export async function scoreTwoCandidates(
  referenceBase64: string,
  candidateABase64: string,
  candidateBBase64: string,
  model?: string
): Promise<TwoCandidateScoreResult> {
  const systemInstruction = `你是一位世界顶级的「PPT视觉总监」。请根据参考图（第一张）的样式，对第二张和第三张「根据样式生成的PPT图」分别打分。

要求：
1. 第一张为参考图（样式基准），第二张为候选图A，第三张为候选图B。
2. 从背景纯度、边缘装饰、色彩与材质、布局锚点等维度，分别评价图A、图B与参考图的一致性。
3. 对图A、图B各打一个 0-100 的整数分，并各用一两句话说明理由。

请严格返回如下 JSON，不要包含 markdown 标记：
{
  "scoreA": 0-100的整数,
  "scoreB": 0-100的整数,
  "reasonA": "对候选图A的简要评价",
  "reasonB": "对候选图B的简要评价"
}`;

  const request = {
    prompt: systemInstruction,
    images: [referenceBase64, candidateABase64, candidateBBase64],
    model: model || 'Doubao-Seed-1.8',
    stream: false,
  };

  try {
    const resultText = await generateWithCustomModel(request);
    const cleanedText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanedText);
    return {
      scoreA: Number(result.scoreA) ?? 0,
      scoreB: Number(result.scoreB) ?? 0,
      reasonA: result.reasonA,
      reasonB: result.reasonB,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { scoreA: 0, scoreB: 0, error: errMsg };
  }
}

