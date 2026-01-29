import { GoogleGenAI, GenerateContentResponse, Chat } from "@google/genai";
import { ImageSize } from '../types';

// Helper to ensure window.aistudio is typed if it exists
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
}

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const generateEvaluationReport = async (
  prompt: string,
  imageA: string,
  imageB: string
): Promise<string> => {
  const API_URL = "http://10.213.47.79:1234/v1/chat/completions";
  const API_KEY = "{BB949A92-3A7E-4850-B544-355E39048B24}";
  
  // Clean base64 strings
  const cleanImageA = imageA.startsWith('data:') ? imageA : `data:image/png;base64,${imageA}`;
  const cleanImageB = imageB.startsWith('data:') ? imageB : `data:image/png;base64,${imageB}`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "Accept": "*/*"
    },
    body: JSON.stringify({
      model: "Doubao-Seed-1.8",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: cleanImageA
              }
            },
            {
              type: "image_url",
              image_url: {
                url: cleanImageB
              }
            }
          ]
        }
      ],
      temperature: 0.2,
      max_tokens: 4096 // Reasonable limit for the HTML report
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("Custom API Error:", errorData);
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "未生成任何响应。";
};

export const generateImage = async (
  prompt: string,
  size: ImageSize
): Promise<string | null> => {
  // Check for API Key selection for Pro Image model
  if (window.aistudio) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
      // Assume success and proceed, or handle error if needed
    }
  }

  // Create a NEW instance to pick up the selected key if applicable
  const ai = getAIClient(); 

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        imageSize: size,
        aspectRatio: "16:9" // Standard for PPT slides
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
};

export const createChatSession = () => {
  // We'll return a simple object that mimics the chat session structure
  // but we'll handle the history ourselves in sendMessageToChat
  return {
    history: [] as any[]
  };
};

export const sendMessageToChat = async (chat: any, message: string): Promise<string> => {
  const API_URL = "http://10.213.47.79:1234/v1/chat/completions";
  const API_KEY = "{BB949A92-3A7E-4850-B544-355E39048B24}";

  // Update history
  chat.history.push({ role: "user", content: message });

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "Doubao-Seed-1.8",
        messages: [
          { role: "system", content: "你是一个集成在 HTML PPT 评估工具中的得力 AI 助手。请使用中文回答用户的问题。" },
          ...chat.history
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) throw new Error("Chat API Error");

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "";
    
    // Add reply to history
    chat.history.push({ role: "assistant", content: reply });
    
    return reply;
  } catch (error) {
    console.error("Chat error:", error);
    return "抱歉，聊天服务出现错误。";
  }
};