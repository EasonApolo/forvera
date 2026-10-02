import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model, Schema, Document } from 'mongoose';
import { Type, type Schema as GenAISchema } from '@google/genai';
import { Public } from '../guards/jwt-auth.guard';
import { OptionalParseIntPipe } from '../shared/parse-int.pipe';
import {
  DictionaryDTO,
  DictionaryRecord,
  DictionaryWordAnalysis,
} from 'shared/types/dictionary';
import { Response } from 'express';
import { AiModule, AiService } from './ai.module';

const DICTIONARY_MODEL_NAME = 'DictionaryRecord';
const DICTIONARY_BIZ_ID = 'dictionary_look_up_word';

interface DictionaryDocument extends Document {
  word: string;
  aiRecordId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DictionarySchema = new Schema<DictionaryDocument>(
  {
    word: { type: String, required: true, unique: true },
    aiRecordId: { type: String, required: true, default: '' },
  },
  {
    collection: 'dictionary',
    timestamps: true,
  },
);

const WordAnalysisSchema: GenAISchema = {
  type: Type.OBJECT,
  properties: {
    isWordValid: {
      type: Type.BOOLEAN,
      description: '输入是否为合法英文单词',
    },
    searchedWord: {
      type: Type.STRING,
      description: '用户输入词',
    },
    canonicalWord: {
      type: Type.STRING,
      description: '规范化原形词',
    },
    invalidReason: {
      type: Type.STRING,
      description: '非法输入时原因',
      nullable: true,
    },
    word: {
      type: Type.STRING,
      description: '最终用于展示和入库的词形（与 canonicalWord 一致）',
    },
    rootAnalysis: {
      type: Type.OBJECT,
      description: '词根解析、词源演变故事及同根词',
      nullable: true,
      properties: {
        root: {
          type: Type.STRING,
          description:
            '用于同根词归类的小写英文词根/前后缀，不加连字符；若无独立词根，回退为 canonicalWord',
        },
        rootMeaning: {
          type: Type.STRING,
          description:
            '词根中文含义和来源说明；若无独立词根需注明原生词/拟声词/借词等',
        },
        etymologyStory: {
          type: Type.STRING,
          description: '通俗、有画面感且逻辑连贯的词源演变故事，帮助记忆',
        },
        cognates: {
          type: Type.ARRAY,
          description: '同根词列表',
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING, description: '同根词' },
              explanation: { type: Type.STRING, description: '简要中文释义' },
            },
            required: ['word', 'explanation'],
          },
        },
      },
      required: ['root', 'rootMeaning', 'etymologyStory', 'cognates'],
    },
    meanings: {
      type: Type.ARRAY,
      description: '词义列表（按词性分类）',
      items: {
        type: Type.OBJECT,
        properties: {
          partOfSpeech: {
            type: Type.STRING,
            description: '词性，如 noun, verb, adjective',
          },
          definitions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                meaning: {
                  type: Type.STRING,
                  description: '极简中文释义，禁止冗余括号解释',
                },
                example: { type: Type.STRING, description: '英文例句' },
                exampleTranslation: {
                  type: Type.STRING,
                  description: '例句中文翻译',
                },
                synonymsAnalysis: {
                  type: Type.ARRAY,
                  description: '当前词义下的同义词与短语辨析',
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      term: { type: Type.STRING, description: '词或短语' },
                      isOriginalWord: {
                        type: Type.BOOLEAN,
                        description: '是否原词',
                      },
                      usageShare: {
                        type: Type.NUMBER,
                        description: '该词义下使用率百分比',
                      },
                      usageContext: {
                        type: Type.STRING,
                        description: '语境差异',
                      },
                      note: { type: Type.STRING, description: '补充说明' },
                    },
                    required: [
                      'term',
                      'isOriginalWord',
                      'usageShare',
                      'usageContext',
                    ],
                  },
                },
              },
              required: [
                'meaning',
                'example',
                'exampleTranslation',
                'synonymsAnalysis',
              ],
            },
          },
        },
        required: ['partOfSpeech', 'definitions'],
      },
    },
  },
  required: [
    'isWordValid',
    'searchedWord',
    'canonicalWord',
    'word',
    'meanings',
  ],
};

class DeleteWordDTO {
  word!: string;
}

@Injectable()
class DictionaryService {
  constructor(
    @InjectModel(DICTIONARY_MODEL_NAME)
    private readonly dictionaryModel: Model<DictionaryDocument>,
    private readonly aiService: AiService,
  ) {}

  normalizeWord(word: string) {
    return word?.trim().toLowerCase() || '';
  }

  public buildPrompt({ word }: { word: string }) {
    const prompt = `你是一个严谨的英语词典分析助手。请分析输入的字符串："${word}"。

  严格遵守以下要求：
  1. 有效性与原形检查：
  - 若不是有效单词，isWordValid 设为 false。
  - 若输入是变形词（如 added, buzzing），searchedWord 保留原输入，canonicalWord 返回原形（如 add, buzz）。

  2. 词根与演变故事：
  - root 是用于同根词归类的标识，只填小写英文字母，不要添加任何连字符、中文、括号或其他符号；前缀、后缀也不要加表示位置的连字符。
  - 原词与派生词必须使用完全相同的 root。例如 chop 和 chopper 的 root 都是 "chop"，不要把 chopper 写成 "chop-"。
  - 正确示例："chop"、"ad"、"vis"；错误示例："chop-"、"ad-"、"chop (切，砍)"。
  - 如果该单词没有独立词根（如 cat/dog、buzz、外来借词等），root 必须直接回退为 canonicalWord 的值（例如 buzz）。
  - rootMeaning 给出简短词源出处与原始含义。
  - etymologyStory 必须提供一段详细、通俗且有画面感的演变故事。若涉及词义转化（如具体器物含义如何演变为抽象含义），必须解释历史或文化背景中的逻辑链。
  - 当触发回退时，rootMeaning 需要明确说明“原生词/拟声词/借词，无独立词根”。
  - 同根词必须是对象数组，每项包含 word 与 explanation。
  - 若无相关派生词，cognates 返回空数组 []。

  3. 释义简洁性：
  - meaning 必须极简直白，严禁括号补充说明。

  4. 同义词层级：
  - 先按词性分类，再按词义分类。
  - 同义词辨析必须绑定在每个词义 definitions 的 synonymsAnalysis 中。
  - 每个词义下必须包含原词本身、同义词和同义短语，usageShare 加和必须为 100。
  - 如果 "${word}" 在它的某个词义下是小众词汇，则usageShare要以通用词汇为整体，例如chopper指一种特殊的摩托车，它的usageShare以所有摩托车作为整体，chopper仅占少数，motorcycle占大多数，而不是仅考虑chopper这一小类摩托车，被查询词在usageShare中不是最多的是合理的。`;

    return prompt;
  }

  async findByWord({ word }: { word: string }) {
    return this.dictionaryModel.findOne({ word });
  }

  async upsertAiLink(word: string, aiRecordId: string) {
    return this.dictionaryModel.findOneAndUpdate(
      { word },
      { $set: { aiRecordId }, $unset: { analysis: '', root: '' } },
      { upsert: true, new: true },
    );
  }

  async getAiRecords(recordIds: string[]) {
    const records = await this.aiService.getRecords(recordIds);
    return new Map(records.map((record) => [String(record._id), record]));
  }

  getRoot(content?: string) {
    if (!content) return '';
    try {
      return `${(JSON.parse(content) as DictionaryWordAnalysis).rootAnalysis?.root || ''}`
        .trim()
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
    } catch {
      return '';
    }
  }

  private isSubsequence(text: string, pattern: string) {
    let i = 0;
    let j = 0;
    while (i < text.length && j < pattern.length) {
      if (text[i] === pattern[j]) {
        j++;
      }
      i++;
    }
    return j === pattern.length;
  }

  private getMatchRank(wordLower: string, keywordLower: string) {
    if (!keywordLower) return 0;
    if (wordLower.startsWith(keywordLower)) return 0;
    if (wordLower.includes(keywordLower)) return 1;
    if (this.isSubsequence(wordLower, keywordLower)) return 2;
    return 3;
  }

  async deleteWord(dto: DeleteWordDTO) {
    const word = `${dto?.word || ''}`.trim();
    if (!word) {
      throw new BadRequestException('word is required');
    }

    const deleted = await this.dictionaryModel.deleteMany({ word: word.toLowerCase() });

    return {
      success: true,
      deletedCount: deleted.deletedCount || 0,
      tempCleared: false,
    };
  }

  async searchWords(keyword: string, limit = 20) {
    const normalized = `${keyword || ''}`.trim().toLowerCase();
    const safeLimit = Math.min(Math.max(limit, 1), 50);

    const rows = await this.dictionaryModel
      .find({}, { word: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean();

    const dedup = new Map<string, any>();
    for (const row of rows) {
      const wordLower = row.word.toLowerCase();
      if (dedup.has(wordLower)) continue;
      dedup.set(wordLower, row);
    }

    const ranked = Array.from(dedup.values())
      .map((row) => {
        const wordLower = row.word.toLowerCase();
        const rank = this.getMatchRank(wordLower, normalized);
        return {
          row,
          rank,
          index: normalized ? wordLower.indexOf(normalized) : 0,
          ts: row.updatedAt ? row.updatedAt.getTime() : 0,
        };
      })
      .filter((item) => (normalized ? item.rank < 3 : true))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.index !== b.index) return a.index - b.index;
        return b.ts - a.ts;
      })
      .slice(0, normalized ? safeLimit : Math.min(safeLimit, 5));

    return {
      success: true,
      items: ranked.map(({ row }) => ({
        _id: String(row._id),
        word: row.word,
        wordLower: row.word.toLowerCase(),
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
      })) as Partial<DictionaryRecord>[],
    };
  }

  async getRecent(limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.dictionaryModel
      .find({}, { word: 1, aiRecordId: 1, createdAt: 1, updatedAt: 1 })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    const records = await this.getAiRecords(rows.map((row) => row.aiRecordId));

    return {
      success: true,
      items: rows.map(
        (row) =>
          ({
            _id: String(row._id),
            word: row.word,
            wordLower: row.word.toLowerCase(),
            root: this.getRoot(records.get(row.aiRecordId)?.content),
            modelName: records.get(row.aiRecordId)?.modelId,
            createdAt: row.createdAt ? row.createdAt.toISOString() : undefined,
            updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
          }) as Partial<DictionaryRecord>,
      ),
    };
  }

  async getRootGroups() {
    const rows = await this.dictionaryModel
      .find({}, { word: 1, aiRecordId: 1, updatedAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const records = await this.getAiRecords(rows.map((row) => row.aiRecordId));
    const latestByWord = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const wordLower = row.word.toLowerCase();
      if (latestByWord.has(wordLower)) continue;
      latestByWord.set(wordLower, row);
    }

    const groups = new Map<
      string,
      {
        root: string;
        count: number;
        words: { word: string; wordLower: string; updatedAt?: string }[];
      }
    >();

    for (const row of latestByWord.values()) {
      const rootValue = this.getRoot(records.get(row.aiRecordId)?.content);
      const key = rootValue || '__NO_ROOT__';
      const group = groups.get(key) || {
        root: rootValue,
        count: 0,
        words: [],
      };

      group.words.push({
        word: row.word,
        wordLower: row.word.toLowerCase(),
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
      });
      group.count += 1;
      groups.set(key, group);
    }

    const items = Array.from(groups.values())
      .sort((a, b) => {
        const aIsEmpty = !a.root;
        const bIsEmpty = !b.root;
        if (aIsEmpty !== bIsEmpty) return aIsEmpty ? 1 : -1;
        if (a.root !== b.root) return a.root.localeCompare(b.root);
        return b.count - a.count;
      })
      .map((group) => ({
        root: group.root,
        label: group.root || '无词根',
        count: group.count,
        words: group.words.sort((a, b) => a.word.localeCompare(b.word)),
      }));

    return {
      success: true,
      items,
    };
  }
}

@Controller('api/dictionary')
class DictionaryController {
  constructor(
    private readonly dictionaryService: DictionaryService,
    private readonly aiService: AiService,
  ) {}

  @Public()
  @Post('analyze')
  async analyze(@Body() data: DictionaryDTO.AnalyzeReq, @Res() res: Response) {
    const word = this.dictionaryService.normalizeWord(data.word);
    if (!word) {
      throw new BadRequestException('word is required');
    }

    const saved = await this.dictionaryService.findByWord({ word });
    const existingRecord = saved?.aiRecordId
      ? await this.aiService.getRecord(saved.aiRecordId)
      : null;
    await this.aiService.stream({
      recordId: existingRecord ? saved.aiRecordId : undefined,
      regenerate: !!data.isRegenerate,
      bizId: DICTIONARY_BIZ_ID,
      question: word,
      prompt: this.dictionaryService.buildPrompt({ word }),
      schema: WordAnalysisSchema,
      res,
      onStart: async (aiRecordId: string) => {
        await this.dictionaryService.upsertAiLink(word, aiRecordId);
      },
    });
  }

  @Public()
  @Post('delete')
  async delete(@Body() dto: DeleteWordDTO) {
    return this.dictionaryService.deleteWord(dto);
  }

  @Public()
  @Get('recent')
  async recent(
    @Query('limit', new OptionalParseIntPipe()) limit: number | undefined,
  ) {
    return this.dictionaryService.getRecent(limit);
  }

  @Public()
  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('limit', new OptionalParseIntPipe()) limit: number | undefined,
  ) {
    return this.dictionaryService.searchWords(q, limit);
  }

  @Public()
  @Get('roots')
  async roots() {
    return this.dictionaryService.getRootGroups();
  }
}

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: DICTIONARY_MODEL_NAME, schema: DictionarySchema },
    ]),
  ],
  controllers: [DictionaryController],
  providers: [DictionaryService],
})
export class DictionaryModule {}
