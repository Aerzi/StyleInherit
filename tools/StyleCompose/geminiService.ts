
import { GoogleGenAI, Type } from "@google/genai";
import { AuditResult } from "./types";

export const performPPTAudit = async (img1: string, img2: string, mimeType: string): Promise<AuditResult> => {
  const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').replace(/^["']|["']$/g, '');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY 未配置，请在 .env.local 文件中设置');
  }
  const ai = new GoogleGenAI({ apiKey });
  
  const systemInstruction = `你是一位世界顶级的“PPT视觉总监”。你的任务是根据《PPT视觉基因提取协议 (V6.2)》对比两张图片。
  
  协议核心维度：
  1. [60%-70% 中心禁区]：忽略此区域的文字内容差异，只比对背景纯度（如噪点、渐变平滑度）。
  2. [边缘装饰锚点]：对比底纹、几何体在四个角落和出血位的布局、尺寸、颜色一致性。
  3. [极端场景处理]：如果背景对比度极低，审计字体色是否通过明度对冲（极黑/极白）保证了可读性。
  4. [材质与物理特性]：比对圆角半径、毛玻璃透明度、投影深度（模糊半径及颜色）的参数化差异。

  请严格按照指定的JSON格式输出。`;

  const prompt = "请分析这两张PPT图片，第一张为基准图，第二张为待审图。根据协议给出对比报告。";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: img1, mimeType } },
            { inlineData: { data: img2, mimeType } },
            { text: prompt }
          ]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchScore: { type: Type.NUMBER, description: "视觉匹配分，0-100" },
            geneTable: {
              type: Type.OBJECT,
              properties: {
                backgroundColor: { type: Type.STRING },
                accentColor: { type: Type.STRING },
                fontColor: { type: Type.STRING },
                materialTexture: { type: Type.STRING },
                layout: { type: Type.STRING }
              },
              required: ["backgroundColor", "accentColor", "fontColor", "materialTexture", "layout"]
            },
            exportAdvice: { type: Type.STRING, description: "修改建议" }
          },
          required: ["matchScore", "geneTable", "exportAdvice"]
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as AuditResult;
  } catch (error) {
    console.error("Audit failed:", error);
    throw error;
  }
};
