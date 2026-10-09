import { EventEmitter } from 'events';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { MongooseModule } from '@nestjs/mongoose';
import { model, Schema } from 'mongoose';
import { AiModule, AiService, classifyAiError } from './ai.module';

describe('classifyAiError', () => {
  it('treats upstream HTTP statuses as api errors', () => {
    expect(classifyAiError(Object.assign(new Error('Too Many Requests'), { status: 429 }))).toBe('api');
    expect(classifyAiError(Object.assign(new Error('bad request'), { code: 400 }))).toBe('api');
    expect(classifyAiError(Object.assign(new Error('unauthorized'), { code: '401' }))).toBe('api');
  });

  it('treats socket-level failures as network errors', () => {
    expect(classifyAiError(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }))).toBe('network');
    expect(classifyAiError(Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }))).toBe('network');
    expect(classifyAiError(new Error('fetch failed'))).toBe('network');
    expect(classifyAiError(new Error('Socket connection timed out'))).toBe('network');
  });
});

describe('AiRecord schema', () => {
  it('accepts empty content while a new record is pending', () => {
    const feature = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AiModule)
      .find((entry: { module: unknown }) => entry.module === MongooseModule);
    const provider = feature.providers.find((entry: { provide: string }) => entry.provide === 'AiRecordModel');
    let recordSchema: Schema;
    provider.useFactory({ models: {}, model: (_name: string, schema: Schema) => {
      recordSchema = schema;
      return {};
    } });
    const Record = model('AiRecordValidationTest', recordSchema!);

    expect(new Record({
      sessionId: 'session', bizId: 'dictionary', modelId: 'gemini',
      prompt: 'word', content: '', status: 'pending',
    }).validateSync()).toBeUndefined();
  });
});

describe('DeepSeekProvider', () => {
  it('parses streamed text without Grok', async () => {
    const Provider = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AiModule)
      .find((entry: { name: string }) => entry.name === 'DeepSeekProvider');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
          ));
          controller.close();
        },
      }),
    } as Response);

    try {
      const chunks = [];
      for await (const chunk of new Provider().generateStream({ prompt: 'test' })) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([{ text: 'hello' }, { done: true }]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('labels upstream HTTP failures as api errors', async () => {
    const Provider = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AiModule)
      .find((entry: { name: string }) => entry.name === 'DeepSeekProvider');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    } as Response);

    try {
      const chunks = [];
      for await (const chunk of new Provider().generateStream({ prompt: 'test' })) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual([{ error: 'DeepSeek error 429: Too Many Requests', errorType: 'api' }]);
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('AiService.stream', () => {
  const makeResponse = () => {
    const res = new EventEmitter() as EventEmitter & {
      writableEnded: boolean;
      write: jest.Mock;
      end: jest.Mock;
      setHeader: jest.Mock;
      flushHeaders: jest.Mock;
    };
    res.writableEnded = false;
    res.write = jest.fn();
    res.end = jest.fn(() => { res.writableEnded = true; });
    res.setHeader = jest.fn();
    res.flushHeaders = jest.fn();
    return res;
  };

  const makeService = (previous: any = null, reply: string | Error = '{"value":1}') => {
    const model = {
      findById: jest.fn(() => ({ lean: async () => previous })),
      findOne: jest.fn(() => ({ sort: () => ({ lean: async () => previous }) })),
      create: jest.fn(async (data) => ({ ...data, _id: 'new-record' })),
      updateOne: jest.fn(async () => ({})),
    };
    const provider = {
      generateStream: jest.fn(async function* () {
        if (reply instanceof Error) throw reply;
        yield { text: reply };
        yield { done: true };
      }),
    };
    return { service: new AiService(model as any, provider as any, provider as any), model, provider };
  };

  const existing = {
    _id: 'existing-record',
    sessionId: 'existing-session',
    bizId: 'dictionary',
    modelId: 'gemini',
    prompt: 'old prompt',
    content: '{"value":1}',
    status: 'done',
  };

  it('creates a new session when no record or session is supplied and formats JSON once', async () => {
    const { service, model, provider } = makeService();
    const res = makeResponse();
    const onStart = jest.fn();
    await service.stream({ bizId: 'dictionary', prompt: 'new prompt', schema: {}, res: res as any, onStart });
    await new Promise(setImmediate);

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: expect.any(String), provider: 'gemini', modelId: 'gemini-2.5-flash', status: 'connecting',
    }));
    expect(onStart).toHaveBeenCalledWith('new-record');
    expect(provider.generateStream).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-2.5-flash' }));
    const events = res.write.mock.calls.map(([data]) => JSON.parse(data.slice(6)));
    expect(events.map(event => event.modelId)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-flash']);
    // 连接中 → 第一个 chunk 到达后转 streaming（随文本一起下发）
    expect(events.map(event => event.status)).toEqual(['connecting', 'streaming', 'done']);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'new-record' },
      { $set: expect.objectContaining({ status: 'done', content: '{\n  "value": 1\n}' }) },
    );
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"content":"{\\n  \\"value\\": 1\\n}"'));
  });

  it('reconnects an in-progress record even when regeneration is requested', async () => {
    const { service, model } = makeService({ ...existing, status: 'streaming' });
    const res = makeResponse();
    await service.stream({ recordId: existing._id, regenerate: true, res: res as any });
    expect(model.create).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"status":"streaming"'));
  });

  it('returns completed records when given a record id', async () => {
    const { service, model } = makeService(existing);
    const res = makeResponse();
    await service.stream({ recordId: existing._id, res: res as any });
    expect(model.create).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"modelId":"gemini-2.5-flash"'));
    expect(res.end).toHaveBeenCalled();
  });

  it('stores and streams DeepSeek model ID separately from its provider', async () => {
    const { service, model, provider } = makeService();
    const res = makeResponse();
    await service.stream({ bizId: 'dictionary', prompt: 'word', modelId: 'deepseek', res: res as any });
    await new Promise(setImmediate);
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'deepseek', modelId: 'deepseek-chat',
    }));
    expect(provider.generateStream).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-chat' }));
    expect(res.write.mock.calls.map(([data]) => JSON.parse(data.slice(6)).modelId)).toEqual([
      'deepseek-chat', 'deepseek-chat', 'deepseek-chat',
    ]);
  });

  it('returns failed records without regenerating until explicitly requested', async () => {
    const { service, model } = makeService({ ...existing, status: 'error', error: 'models/gemini is not found' });
    const res = makeResponse();
    const onStart = jest.fn();
    await service.stream({ recordId: existing._id, res: res as any, onStart });
    expect(model.create).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('models/gemini is not found'));
    expect(res.end).toHaveBeenCalled();

    await service.stream({ recordId: existing._id, regenerate: true, res: makeResponse() as any, onStart });
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: existing.sessionId, status: 'connecting', provider: 'gemini', modelId: 'gemini-2.5-flash',
    }));
    expect(onStart).toHaveBeenCalledWith('new-record');
  });

  it('marks a connection-phase failure as a network error', async () => {
    const { service, model } = makeService(
      null,
      Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
    );
    const res = makeResponse();
    await service.stream({ bizId: 'dictionary', prompt: 'test', res: res as any });
    await new Promise(setImmediate);

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'new-record' },
      { $set: expect.objectContaining({ status: 'error', errorType: 'network' }) },
    );
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"errorType":"network"'));
  });

  it('rejects a removed provider instead of routing it to Gemini', async () => {
    const { service, model } = makeService();
    await expect(service.stream({
      bizId: 'dictionary', prompt: 'test', modelId: 'grok' as any, res: makeResponse() as any,
    })).rejects.toThrow('Unsupported AI provider');
    expect(model.create).not.toHaveBeenCalled();
  });

  it('creates a new question in an existing session without replaying its prior record', async () => {
    const { service, model } = makeService(existing);
    const res = makeResponse();
    await service.stream({ sessionId: existing.sessionId, bizId: existing.bizId, prompt: 'next question', res: res as any });
    expect(model.findById).not.toHaveBeenCalled();
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: existing.sessionId, prompt: 'next question',
    }));
  });

  it('regenerates completed records in the same session with a new record id', async () => {
    const { service, model } = makeService(existing);
    const res = makeResponse();
    const onStart = jest.fn();
    await service.stream({ recordId: existing._id, regenerate: true, prompt: 'new prompt', res: res as any, onStart });
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: existing.sessionId, prompt: 'new prompt', bizId: existing.bizId,
    }));
    expect(onStart).toHaveBeenCalledWith('new-record');
  });

  it('marks an invalid schema reply as an error instead of done', async () => {
    const { service, model } = makeService(null, 'not json');
    const res = makeResponse();
    await service.stream({ bizId: 'dictionary', prompt: 'test', schema: {}, res: res as any });
    await new Promise(setImmediate);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: 'new-record' },
      { $set: expect.objectContaining({ status: 'error' }) },
    );
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"status":"error"'));
  });
});