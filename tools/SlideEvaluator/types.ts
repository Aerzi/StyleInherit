export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum ImageSize {
  OneK = '1K',
  TwoK = '2K',
  FourK = '4K',
}

export interface EvaluationConfig {
  userPrompt: string;
  modelA: {
    image: string | null; // base64
  };
  modelB: {
    image: string | null; // base64
  };
}

export enum AppTab {
  EVALUATOR = 'evaluator',
  IMAGE_GEN = 'image_gen',
  CHAT = 'chat',
}
