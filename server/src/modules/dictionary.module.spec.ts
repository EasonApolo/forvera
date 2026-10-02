import { MODULE_METADATA } from '@nestjs/common/constants';
import { AiService } from './ai.module';
import { DictionaryModule } from './dictionary.module';

describe('DictionaryController.analyze', () => {
  const Controller = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, DictionaryModule)[0];

  const makeController = (recordId?: string, record?: object) => {
    const dictionaryModel = {
      findOne: jest.fn(async () => recordId ? { aiRecordId: recordId } : null),
      findOneAndUpdate: jest.fn(async () => ({})),
    };
    const aiService = {
      getRecord: jest.fn(async () => record || null),
      stream: jest.fn(async (params) => {
        if (!params.recordId || params.regenerate) {
          await params.onStart('new-record');
        }
      }),
    };
    const Service = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DictionaryModule)
      .find((provider: any) => provider !== AiService);
    const dictionaryService = new Service(dictionaryModel, aiService);
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

describe('DictionaryService roots', () => {
  const Service = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DictionaryModule)
    .find((provider: any) => provider !== AiService);

  it('groups old hyphenated roots with their base words', async () => {
    const rows = [
      { word: 'chop', aiRecordId: 'base' },
      { word: 'chopper', aiRecordId: 'derived' },
    ];
    const dictionaryModel = {
      find: jest.fn(() => ({ sort: () => ({ lean: async () => rows }) })),
    };
    const aiService = {
      getRecords: jest.fn(async () => [
        { _id: 'base', content: JSON.stringify({ rootAnalysis: { root: 'chop' } }) },
        { _id: 'derived', content: JSON.stringify({ rootAnalysis: { root: 'chop-' } }) },
      ]),
    };
    const service = new Service(dictionaryModel, aiService);

    expect(service.buildPrompt({ word: 'chopper' })).toContain('chop 和 chopper 的 root 都是 "chop"');
    expect((await service.getRootGroups()).items).toEqual([
      expect.objectContaining({ root: 'chop', count: 2, words: [
        expect.objectContaining({ word: 'chop' }),
        expect.objectContaining({ word: 'chopper' }),
      ] }),
    ]);
  });
});