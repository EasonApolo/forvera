export type AiProviderType = 'gemini' | 'deepseek';

export interface AiGenerateOptions {
  prompt: string;
  temperature?: number;
  schema?: any;           // JSON Schema，用于结构化输出
  baseUrl?: string;       // 代理地址，可选
  model?: string;         // 具体模型名
  systemInstruction?: string;
}

export interface AiStreamChunk {
  text?: string;
  done?: boolean;
  error?: string;
}

export interface AiProvider {
  generateStream(options: AiGenerateOptions): AsyncGenerator<AiStreamChunk>;
}