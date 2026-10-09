import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiService } from './ai.module';
import { DictionaryModule } from './dictionary.module';

describe('DictionaryController.analyze', () => {
  const Controller = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DictionaryModule)[0];

  const makeController = (recordId?: string, record?: object) => {
    const dictionaryModel = {
      findOne: jest.fn(async () => recordId ? { aiRecordId: recordId } : null),
      findOneAndUpdate: jest.fn(async () => ({})),
      find: jest.fn(() => ({ sort: () => ({ lean: async () => [] }) })),
    };
    const aiService = {
      getRecord: jest.fn(async () => record || null),
      getRecords: jest.fn(async () => record ? [record as any] : []),
      stream: jest.fn(async (params) => {
        if (!params.recordId || params.regenerate) {
          await params.onStart('new-record');
        }
      }),
    };
    const learningModel = {
      bulkWrite: jest.fn(async () => ({ upsertedCount: 0 })),
      countDocuments: jest.fn(async () => 0),
      aggregate: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    };
    const Service = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DictionaryModule)
      .find((provider: any) => provider !== AiService);
    const dictionaryService = new Service(dictionaryModel, learningModel, aiService);
    const controller = new Controller(dictionaryService, aiService);
    return { controller, dictionaryModel, aiService };
  };

  it('starts a new session and stores only the AI record link for a new word', async () => {
    const { controller, dictionaryModel, aiService } = makeController();
    await controller.analyze({ word: ' CAT ' }, {});
    expect(aiService.stream).toHaveBeenCalledWith(expect.objectContaining({
      recordId: undefined, regenerate: false, bizId: 'dictionary_look_up_word',
      question: 'cat',
    }));
    expect(aiService.stream.mock.calls[0][0]).not.toHaveProperty('sessionId');
    expect(dictionaryModel.findOneAndUpdate).toHaveBeenCalledWith(
      { word: 'cat' },
      { $set: { aiRecordId: 'new-record' }, $unset: { analysis: '', root: '' } },
      { upsert: true, new: true },
    );
  });

  it('uses the same record for an existing word', async () => {
    const { controller, aiService, dictionaryModel } = makeController('old-record', { status: 'done' });
    await controller.analyze({ word: 'cat' }, {});
    expect(aiService.stream).toHaveBeenCalledWith(expect.objectContaining({
      recordId: 'old-record', regenerate: false,
    }));
    expect(dictionaryModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requests regeneration and updates the word link to the new record', async () => {
    const { controller, aiService, dictionaryModel } = makeController('old-record', { status: 'done' });
    await controller.analyze({ word: 'cat', isRegenerate: true }, {});
    expect(aiService.stream).toHaveBeenCalledWith(expect.objectContaining({
      recordId: 'old-record', regenerate: true,
    }));
    expect(dictionaryModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('DictionaryService learning words', () => {
  const Service = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DictionaryModule)
    .find((provider: any) => provider !== AiService);

  it('extracts english words from mixed-punctuation text, filtering short fragments', () => {
    const service = new Service({} as any, {} as any, {} as any);
    expect(service.extractWords("Hello, world! 你好；this is a test. don't stop——okay?"))
      .toEqual(['don', 'hello', 'okay', 'stop', 'test', 'this', 'world']);
    expect(service.extractWords('')).toEqual([]);
  });

  it('adds learning words while skipping already queried ones', async () => {
    const bulkWrite = jest.fn(async (_ops: any[]) => ({ upsertedCount: 2 }));
    const countDocuments = jest.fn(async () => 5);
    const dictionaryModel = {
      find: jest.fn(() => ({ lean: async () => [{ word: 'chop' }] })),
    };
    const learningModel = { bulkWrite, countDocuments };
    const service = new Service(dictionaryModel as any, learningModel as any, {} as any);

    const result = await service.addLearningWords('Chop, hello world!');

    expect(result).toEqual({ success: true, addedCount: 2, skippedQueried: 1, total: 5 });
    expect(bulkWrite.mock.calls[0][0].map((op: any) => op.updateOne.filter.word))
      .toEqual(['hello', 'world']);
  });
});

describe('DictionaryService categories', () => {
  const Service = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DictionaryModule)
    .find((provider: any) => provider !== AiService);

  const contentWith = (classifications: string[][]) => JSON.stringify({
    meanings: [{
      partOfSpeech: 'noun',
      definitions: classifications.map((classification) => ({ meaning: 'x', classification })),
    }],
  });

  it('builds a nested category tree with subtree counts and an unclassified bucket', async () => {
    const rows = [
      { word: 'chop', aiRecordId: 'r1' },
      { word: 'chopper', aiRecordId: 'r2' },
      { word: 'legacy', aiRecordId: 'r3' },
    ];
    const dictionaryModel = {
      find: jest.fn(() => ({ sort: () => ({ lean: async () => rows }) })),
    };
    const aiService = {
      getRecords: jest.fn(async () => [
        { _id: 'r1', content: contentWith([['自然', '生物', '动物'], ['人类生活', '饮食', '烹饪']]) },
        { _id: 'r2', content: contentWith([['人类生活', '饮食', '烹饪']]) },
        { _id: 'r3', content: contentWith([]) },
      ]),
    };
    const learningModel = {
      bulkWrite: jest.fn(async () => ({ upsertedCount: 0 })),
      countDocuments: jest.fn(async () => 0),
      aggregate: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
    };
    const service = new Service(dictionaryModel, learningModel, aiService);

    expect(service.buildPrompt({ word: 'chopper' })).toContain('层数动态决定');
    expect(service.buildPrompt({ word: 'chopper', knownCategoryPaths: ['自然/生物'] }))
      .toContain('- 自然/生物');

    const { items, wordCount } = await service.getCategoryGroups();
    expect(wordCount).toBe(3);
    // 子树词数降序，未分类垫底
    expect(items.map((item: any) => item.label)).toEqual(['人类生活', '自然', '未分类']);
    expect(items[0]).toMatchObject({ count: 2 });
    expect(items[0].children[0]).toMatchObject({ label: '饮食', count: 2 });
    expect(items[0].children[0].children[0].words.map((w: any) => w.word).sort())
      .toEqual(['chop', 'chopper']);
    expect(items[2]).toMatchObject({
      label: '未分类', count: 1,
      words: [expect.objectContaining({ word: 'legacy' })],
    });
  });
});