// src/ai/ai.module.ts
import {
  BadRequestException,
  Module,
  Controller,
  Post,
  Body,
  Res,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { Document, Model, Schema, isValidObjectId } from 'mongoose';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

// ===================== 类型 =====================
export type AiProviderType = 'gemini' | 'deepseek';
type AiStreamStatus = 'pending' | 'streaming' | 'done' | 'error';
const AI_RECORD_MODEL_NAME = 'AiRecord';
const MODEL_IDS: Record<AiProviderType, string> = {
  gemini: 'gemini-2.5-flash',
  deepseek: 'deepseek-chat',
};

export interface LlmStreamChunk {
  text?: string;
  done?: boolean;
  error?: string;
}

export interface AiSseChunk {
  recordId?: string;
  sessionId?: string;
  modelId?: string;
  text?: string;
  content?: string;
  status?: AiStreamStatus;
  error?: string;
}

interface AiProviderOptions {
  model?: string;
  prompt: string;
  temperature?: number;
  schema?: object;
  systemInstruction?: string;
}

export interface AiRecordDocument extends Document {
  sessionId: string;
  userId?: string;

  // 业务
  bizId: string;

  // 模型
  provider?: AiProviderType;
  modelId: string;

  // 内容
  /** 最终给大模型的完整prompt，一定会有 */
  prompt: string;
  /** 用户输入的问题，不一定会有 */
  question?: string;
  content: string;

  // 状态
  status: AiStreamStatus;
  error: string | null;

  createdAt: Date;
  updatedAt: Date;
}
export type AiStreamModelParams = {
  temperature?: number;
  systemInstruction?: string;
  schema?: any;
};
export type AiStreamHooks = {
  onStart?: (recordId: string) => Promise<void> | void;
};
export type AiRequest = {
  recordId?: string;
  sessionId?: string;
  regenerate?: boolean;
  userId?: string;
  bizId?: string;
  modelId?: AiProviderType;
  question?: string;
  prompt?: string;
  res: Response;
} & AiStreamModelParams & AiStreamHooks;
const AiRecordSchema = new Schema<AiRecordDocument>(
  {
    sessionId: { type: String, required: true, index: true },
    userId: { type: String, required: false },

    bizId: { type: String, required: true },

    provider: { type: String, required: false },
    modelId: { type: String, required: true },

    prompt: { type: String, required: true },
    question: { type: String, required: false },
    content: { type: String, default: '' },

    status: {
      type: String,
      required: true,
      enum: ['pending', 'streaming', 'done', 'error'],
    },
    error: { type: String, required: false },
  },
  {
    collection: AI_RECORD_MODEL_NAME.toLowerCase(),
    timestamps: true,
  },
);

// ===================== Providers =====================
@Injectable()
class GeminiProvider {
  async *generateStream(
    options: AiProviderOptions,
  ): AsyncGenerator<LlmStreamChunk> {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const stream = await ai.models.generateContentStream({
      model: options.model || MODEL_IDS.gemini,
      contents: options.prompt,
      config: {
        temperature: options.temperature ?? 0.2,
        responseMimeType: options.schema ? 'application/json' : undefined,
        responseSchema: options.schema,
        systemInstruction: options.systemInstruction,
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) yield { text: chunk.text };
    }
    yield { done: true };
  }
}

@Injectable()
class DeepSeekProvider {
  async *generateStream(
    options: AiProviderOptions,
  ): AsyncGenerator<LlmStreamChunk> {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: options.model || MODEL_IDS.deepseek,
        messages: [
          ...(options.systemInstruction
            ? [{ role: 'system', content: options.systemInstruction }]
            : []),
          { role: 'user', content: options.prompt },
        ],
        temperature: options.temperature ?? 0.2,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      yield { error: `DeepSeek error: ${res.statusText}` };
      return;
    }

    yield* this.readOpenAIStream(res.body);
  }

  private async *readOpenAIStream(
    body: ReadableStream,
  ): AsyncGenerator<LlmStreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          yield { done: true };
          return;
        }
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield { text };
        } catch {}
      }
    }
    yield { done: true };
  }
}

// ===================== Service =====================
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly emitters = new Map<string, EventEmitter>();

  constructor(
    @InjectModel(AI_RECORD_MODEL_NAME)
    private readonly aiRecordModel: Model<AiRecordDocument>,
    private readonly gemini: GeminiProvider,
    private readonly deepseek: DeepSeekProvider,
  ) {}

  private getEmitter(recordId: string): EventEmitter {
    let em = this.emitters.get(recordId);
    if (!em) {
      em = new EventEmitter();
      em.setMaxListeners(50);
      this.emitters.set(recordId, em);
    }
    return em;
  }

  private emit(recordId: string, modelId: string, chunk: AiSseChunk) {
    this.getEmitter(recordId).emit('chunk', { ...chunk, modelId });
  }

  private releaseEmitter(recordId: string) {
    const em = this.emitters.get(recordId);
    if (em) {
      em.removeAllListeners();
      this.emitters.delete(recordId);
    }
  }

  private getProvider(provider: AiProviderType) {
    if (provider === 'deepseek') return this.deepseek;
    return this.gemini;
  }

  async *streamGenerate({
    provider,
    modelId,
    prompt,
    temperature,
    schema,
  }: {
    provider: AiProviderType;
    modelId: AiRecordDocument['modelId'];
    prompt: string;
    temperature?: number;
    schema?: object;
  }): AsyncGenerator<LlmStreamChunk> {
    const impl = this.getProvider(provider);

    try {
      for await (const chunk of impl.generateStream({
        model: modelId,
        prompt,
        schema,
        temperature: temperature ?? 0.2,
      })) {
        yield chunk;
      }
    } catch (err: any) {
      this.logger.error(err);
      yield { error: err.message || 'AI failed' };
    }
  }

  /**
   * 后台跑生成：与是否还有 HTTP 连接无关
   */
  private async runGeneration(params: {
    recordId: string;
    provider: AiProviderType;
    modelId: AiRecordDocument['modelId'];
    prompt: string;
    temperature?: number;
    schema?: object;
  } & AiStreamModelParams) {
    const { recordId } = params;
    let fullText = '';

    try {
      await this.aiRecordModel.updateOne(
        { _id: recordId },
        { $set: { status: 'streaming' } },
      );

      for await (const chunk of this.streamGenerate(params)) {
        if (chunk.text) {
          fullText += chunk.text;
          await this.aiRecordModel.updateOne(
            { _id: recordId },
            { $set: { content: fullText, updatedAt: new Date() } },
          );
          this.emit(recordId, params.modelId, { text: chunk.text });
        }
        if (chunk.error) {
          await this.aiRecordModel.updateOne(
            { _id: recordId },
            {
              $set: {
                status: 'error',
                error: chunk.error,
                content: fullText,
              },
            },
          );
          this.emit(recordId, params.modelId, { error: chunk.error, status: 'error' });
          this.releaseEmitter(recordId);
          return;
        }
        if (chunk.done) {
          const content = params.schema
            ? JSON.stringify(JSON.parse(fullText), null, 2)
            : fullText;
          await this.aiRecordModel.updateOne(
            { _id: recordId },
            {
              $set: {
                status: 'done',
                content,
                updatedAt: new Date(),
              },
            },
          );
          this.emit(recordId, params.modelId, { status: 'done', content });
          this.releaseEmitter(recordId);
          return;
        }
      }

      // 模型没抛 done 时兜底
      const content = params.schema
        ? JSON.stringify(JSON.parse(fullText), null, 2)
        : fullText;
      await this.aiRecordModel.updateOne(
        { _id: recordId },
        { $set: { status: 'done', content } },
      );
      this.emit(recordId, params.modelId, { status: 'done', content });
      this.releaseEmitter(recordId);
    } catch (err: any) {
      this.logger.error(err);
      await this.aiRecordModel.updateOne(
        { _id: recordId },
        {
          $set: {
            status: 'error',
            error: err.message || 'AI failed',
          },
        },
      );
      this.emit(recordId, params.modelId, {
        error: err.message || 'AI failed',
        status: 'error',
      });
      this.releaseEmitter(recordId);
    }
  }

  private isEnd(record: AiRecordDocument | AiSseChunk) {
    return record.status ? ['done', 'error'].includes(record.status) : false;
  }

  /** 把某个 record 的 SSE 写到 res（历史 + 可选后续） */
  private attachSse(res: Response, recordId: string, record: AiRecordDocument) {
    const write = (data: AiSseChunk) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    // 根据当前状态先推一次，至少要给前端recordId
    write({
      recordId,
      sessionId: record.sessionId,
      modelId: MODEL_IDS[record.modelId as AiProviderType] || record.modelId,
      status: record.status,
      content: record.content || '',
      error: record.error || undefined,
    });

    // 已结束
    if (this.isEnd(record)) {
      res.end();
      return;
    }

    // 3) 未结束：订阅后续
    const em = this.getEmitter(recordId);
    const onChunk = (chunk: AiSseChunk) => {
      write({ ...chunk, recordId });
      if (this.isEnd(chunk)) {
        em.off('chunk', onChunk);
        if (!res.writableEnded) res.end();
      }
    };
    em.on('chunk', onChunk);

    const cleanup = () => {
      em.off('chunk', onChunk);
    };
    res.on('close', cleanup);
    res.on('error', cleanup);
  }

  private setSseHeaders(res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
  }

  async stream(params: AiRequest): Promise<string> {
    let previous: AiRecordDocument | null = null;
    if (params.recordId) {
      previous = await this.aiRecordModel.findById(params.recordId).lean();
      if (!previous) throw new NotFoundException('AI record not found');
    }

    if (previous && params.bizId && previous.bizId !== params.bizId) {
      throw new BadRequestException('AI record belongs to another business');
    }

    if (previous && ['pending', 'streaming'].includes(previous.status)) {
      this.setSseHeaders(params.res);
      this.attachSse(params.res, String(previous._id), previous);
      return String(previous._id);
    }
    if (previous && ['done', 'error'].includes(previous.status) && !params.regenerate) {
      this.setSseHeaders(params.res);
      this.attachSse(params.res, String(previous._id), previous);
      return String(previous._id);
    }

    const prompt = params.prompt || previous?.prompt;
    const bizId = params.bizId || previous?.bizId;
    if (!prompt || !bizId) {
      throw new BadRequestException('bizId and prompt are required for a new request');
    }
    const provider = params.modelId || previous?.provider || previous?.modelId || 'gemini';
    if (provider !== 'gemini' && provider !== 'deepseek') {
      throw new BadRequestException('Unsupported AI provider');
    }
    const modelId = MODEL_IDS[provider];

    const record = await this.aiRecordModel.create({
      sessionId: previous?.sessionId || params.sessionId || randomUUID(),
      userId: params.userId || previous?.userId,
      bizId,
      provider,
      modelId,
      question: params.question || previous?.question,
      prompt,
      content: '',
      status: 'pending',
    });
    const recordId = String(record._id);
    await params.onStart?.(recordId);
    this.setSseHeaders(params.res);
    this.attachSse(params.res, recordId, record);
    void this.runGeneration({
      recordId,
      provider,
      modelId: record.modelId,
      prompt,
      temperature: params.temperature,
      schema: params.schema,
    });
    return recordId;
  }

  async getRecord(_id: string) {
    if (!isValidObjectId(_id)) return null;
    return this.aiRecordModel.findById(_id).lean();
  }

  async getRecords(recordIds: string[]) {
    return this.aiRecordModel
      .find({ _id: { $in: recordIds.filter(isValidObjectId) } })
      .lean();
  }
}

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('stream')
  async stream(
    @Body() body: Omit<AiRequest, 'res' | 'onStart'>,
    @Res() res: Response,
  ) {
    await this.aiService.stream({
      ...body,
      res,
    });
  }
}

// ===================== Module =====================
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AI_RECORD_MODEL_NAME, schema: AiRecordSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, GeminiProvider, DeepSeekProvider],
  exports: [AiService],
})
export class AiModule {}
