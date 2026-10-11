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
const DICTIONARY_LEARNING_MODEL_NAME = 'DictionaryLearning';
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

interface DictionaryLearningDocument extends Document {
  word: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DictionaryLearningSchema = new Schema<DictionaryLearningDocument>(
  {
    word: { type: String, required: true, unique: true },
  },
  {
    collection: 'dictionarylearning',
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
    correctedWord: {
      type: Type.STRING,
      description:
        '输入疑似拼写错误且能高置信推断出本来的词时，填推断出的正确原形（小写）；否则留空',
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
                classification: {
                  type: Type.ARRAY,
                  description:
                    '该词义在格拉斯哥英语历史分类词典（Historical Thesaurus of English）概念层级中的完整路径：第一层为三大主干（外部世界/精神世界/社会世界）之一，逐层细化到该概念真实所在的末端类目（HTE 末端类目通常在第 4~7 层，至少 4 层）；禁止使用被查词本身或其释义充当分类名，禁止生造 HTE 中不存在的层级',
                  items: {
                    type: Type.STRING,
                  },
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
                'classification',
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
    @InjectModel(DICTIONARY_LEARNING_MODEL_NAME)
    private readonly learningModel: Model<DictionaryLearningDocument>,
    private readonly aiService: AiService,
  ) {}

  normalizeWord(word: string) {
    return word?.trim().toLowerCase() || '';
  }

  /**
   * 从任意文本（句子/段落/单词列表，中英文标点、空格、换行混排）中提取英文单词：
   * 连续字母序列、小写化、过滤 2 字母以下的碎片、去重
   */
  extractWords(text: string) {
    const tokens: string[] = `${text || ''}`.toLowerCase().match(/[a-z]+/g) || [];
    const deduped = Array.from(new Set(tokens.filter((token) => token.length >= 3)));
    return deduped.sort();
  }

  async addLearningWords(text: string) {
    const words = this.extractWords(text);
    if (!words.length) {
      return { success: true, addedCount: 0, total: await this.learningModel.countDocuments() };
    }

    // 已查过的词（在 dictionary 主表里）视为已学，不再进待学列表
    const queried = await this.dictionaryModel
      .find({ word: { $in: words } }, { word: 1 })
      .lean();
    const queriedSet = new Set(queried.map((row) => row.word.toLowerCase()));
    const toAdd = words.filter((word) => !queriedSet.has(word));

    let addedCount = 0;
    if (toAdd.length) {
      const result = await this.learningModel.bulkWrite(
        toAdd.map((word) => ({
          updateOne: {
            filter: { word },
            update: { $setOnInsert: { word } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
      addedCount = result.upsertedCount || 0;
    }

    return {
      success: true,
      addedCount,
      skippedQueried: words.length - toAdd.length,
      total: await this.learningModel.countDocuments(),
    };
  }

  async getLearningWords(limit = 100) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const [items, total] = await Promise.all([
      this.learningModel.aggregate<{ word: string }>([{ $sample: { size: safeLimit } }]),
      this.learningModel.countDocuments(),
    ]);
    return {
      success: true,
      total,
      items: items.map((item) => ({ word: item.word })),
    };
  }

  async deleteLearningWord(word: string) {
    const normalized = this.normalizeWord(word);
    const deleted = await this.learningModel.deleteMany({ word: normalized });
    return {
      success: true,
      deletedCount: deleted.deletedCount || 0,
      total: await this.learningModel.countDocuments(),
    };
  }

  public buildPrompt({ word, knownCategoryPaths = [] }: { word: string; knownCategoryPaths?: string[] }) {
    const knownCategoriesBlock = knownCategoryPaths.length
      ? `\n  已有分类路径（跨词保持一致，语义匹配时优先复用，必要时才新增）：\n${knownCategoryPaths.map((path) => `  - ${path}`).join('\n')}\n`
      : '';

    const prompt = `你是一个严谨的英语词典分析助手。请分析输入的字符串："${word}"。

  严格遵守以下要求：
  1. 有效性与原形检查：
  - 若不是有效单词，isWordValid 设为 false。
  - 若输入是某词的变形（时态/复数/比较级等，如 added, buzzing, greatest）且本身没有独立含义，searchedWord 保留原输入，canonicalWord 返回原形（如 add, buzz, great），word 与 canonicalWord 一致，isWordValid 仍为 true。
  - 若输入疑似拼写错误且你能高置信推断出本来的词（如 gretest → greatest、recieve → receive），isWordValid 设为 false，invalidReason 简述原因，correctedWord 填推断出的正确原形（小写）。
  - 若输入既不是有效单词，也没有高置信的相近词，correctedWord 留空。

  2. 词义划分（参照 HTE）：
  - 词义的数量与划分以 HTE 对该词的收录为准：HTE 将该词归入几个概念类目，就给出几个词义；每个词义的 classification 即对应该类目的路径。
  - 跳过 HTE 中标注为已废弃、古旧或仅限方言的用法（obsolete / archaic / dialectal）：例如 HTE 收录 4 个概念、其中 1 个已废弃，则只给出 3 个词义。
  - 词义划分必须稳定：同一单词的重复查询应得到相同的词义数量和划分，不要自行合并、拆分或新增 HTE 之外的概念。
  - 仅当某个现代主流用法在 HTE 中确实缺失时（如 HTE 出版后的新义）才补充该词义，并在释义中体现其现代性。

  3. 词根与演变故事：
  - root 是用于同根词归类的标识，只填小写英文字母，不要添加任何连字符、中文、括号或其他符号；前缀、后缀也不要加表示位置的连字符。
  - 原词与派生词必须使用完全相同的 root。例如 chop 和 chopper 的 root 都是 "chop"，不要把 chopper 写成 "chop-"。
  - 正确示例："chop"、"ad"、"vis"；错误示例："chop-"、"ad-"、"chop (切，砍)"。
  - 如果该单词没有独立词根（如 cat/dog、buzz、外来借词等），root 必须直接回退为 canonicalWord 的值（例如 buzz）。
  - rootMeaning 给出简短词源出处与原始含义。
  - etymologyStory 必须提供一段详细、通俗且有画面感的演变故事。若涉及词义转化（如具体器物含义如何演变为抽象含义），必须解释历史或文化背景中的逻辑链。
  - 当触发回退时，rootMeaning 需要明确说明“原生词/拟声词/借词，无独立词根”。
  - 同根词必须是对象数组，每项包含 word 与 explanation。
  - 若无相关派生词，cognates 返回空数组 []。

  4. 释义简洁性：
  - meaning 必须极简直白，严禁括号补充说明。

  5. 同义词层级：
  - 先按词性分类，再按词义分类。
  - 同义词辨析必须绑定在每个词义 definitions 的 synonymsAnalysis 中。
  - 每个词义下必须包含原词本身、同义词和同义短语，usageShare 加和必须为 100。
  - 如果 "${word}" 在它的某个词义下是小众词汇，则usageShare要以通用词汇为整体，例如chopper指一种特殊的摩托车，它的usageShare以所有摩托车作为整体，chopper仅占少数，motorcycle占大多数，而不是仅考虑chopper这一小类摩托车，被查询词在usageShare中不是最多的是合理的。

  6. 词义通用分类：
  - 每个词义（definitions 的每一项）都必须给出 classification：通用分类路径数组，参照格拉斯哥大学《格拉斯哥英语历史分类词典》（Historical Thesaurus of English, HTE）的概念层级。
  - 第一层必须且只能是 HTE 的三大主干之一：「外部世界」（自然界、物质、生物、空间、时间等）、「精神世界」（感知、情感、思想、意志、认知、语言等）、「社会世界」（社会组织、法律、政治、经济、文化、技术、风俗等）。
  - 之后沿 HTE 概念树逐层细化，一直给到该概念真实所在的末端类目。HTE 的末端类目绝大多数位于第 4~7 层，禁止在第 3 层处截断；只有概念确实位于 HTE 上层节点时才允许更浅的路径。
  - 参照示例（真实 HTE 深度）：blacksmith => 社会 > 经济 > 职业与工作 > 手工业者 > 金属工人 > 铁匠（6 层）；anger => 精神世界 > 情感 > 情感状态 > 消极情感 > 愤怒（5 层）；harbor => 外部世界 > 建造环境 > 建筑物 > 水运建筑 > 港口（5 层）。
  - 分类名使用 HTE 类目的通行中文译名（简体中文）；禁止使用被查词本身、其释义或例句内容充当分类名。
  - 一致性优先：若提供了「已有分类路径」，语义匹配时必须复用完全相同的路径前缀（包括用字），不要为同一概念另造近义路径。${knownCategoriesBlock}
  - 多义词的不同词义可以归属不同分类路径；同一词的多个词义若语义相近，可共用同一路径。`;

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

  /** 从分析内容里提取该词所有词义的分类路径（去重，路径截断到 5 层） */
  getClassificationPaths(content?: string): string[][] {
    if (!content) return [];
    try {
      const analysis = JSON.parse(content) as DictionaryWordAnalysis;
      const paths = new Set<string>();
      for (const meaning of analysis.meanings || []) {
        for (const definition of meaning.definitions || []) {
          const path = (definition.classification || [])
            .map((label) => `${label}`.trim())
            .filter(Boolean)
            .slice(0, 5);
          if (path.length >= 1) paths.add(JSON.stringify(path));
        }
      }
      return Array.from(paths).map((path) => JSON.parse(path) as string[]);
    } catch {
      return [];
    }
  }

  /**
   * 动态从词汇表生成多层级分类树（不落单独的表，保证与词汇数据始终一致）。
   * 每个词按其所有词义的分类路径挂到对应叶子节点；没有分类信息的老数据进「未分类」。
   */
  async getCategoryGroups(excludeWord?: string) {
    const rows = await this.dictionaryModel
      .find({}, { word: 1, aiRecordId: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const records = await this.getAiRecords(rows.map((row) => row.aiRecordId));
    const latestByWord = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const wordLower = row.word.toLowerCase();
      if (excludeWord && wordLower === excludeWord.toLowerCase()) continue;
      if (latestByWord.has(wordLower)) continue;
      latestByWord.set(wordLower, row);
    }

    interface CategoryNode {
      label: string;
      words: Map<string, string>;
      children: Map<string, CategoryNode>;
    }
    const makeNode = (label: string): CategoryNode => ({
      label,
      words: new Map(),
      children: new Map(),
    });
    const rootNode = makeNode('');
    const unclassified = new Map<string, string>();

    for (const row of latestByWord.values()) {
      const paths = this.getClassificationPaths(
        records.get(row.aiRecordId)?.content,
      );
      if (!paths.length) {
        unclassified.set(row.word.toLowerCase(), row.word);
        continue;
      }
      for (const path of paths) {
        let node = rootNode;
        for (const label of path) {
          let child = node.children.get(label);
          if (!child) {
            child = makeNode(label);
            node.children.set(label, child);
          }
          node = child;
        }
        node.words.set(row.word.toLowerCase(), row.word);
      }
    }

    const toTreeNode = (node: CategoryNode) => {
      const children = Array.from(node.children.values())
        .map(toTreeNode)
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.label.localeCompare(b.label, 'zh');
        });
      return {
        label: node.label,
        count: node.words.size + children.reduce((sum, child) => sum + child.count, 0),
        words: Array.from(node.words.values())
          .sort((a, b) => a.localeCompare(b, 'zh'))
          .map((word) => ({ word, wordLower: word.toLowerCase() })),
        children,
      };
    };

    const items = Array.from(rootNode.children.values())
      .map(toTreeNode)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.label.localeCompare(b.label, 'zh');
      });

    if (unclassified.size) {
      items.push({
        label: '未分类',
        count: unclassified.size,
        words: Array.from(unclassified.entries())
          .map(([wordLower, word]) => ({ word, wordLower }))
          .sort((a, b) => a.word.localeCompare(b.word, 'zh')),
        children: [],
      });
    }

    return {
      success: true,
      wordCount: latestByWord.size,
      items,
    };
  }

  /** 取分类树中 HTE 体系（三大主干）的完整路径（按词数降序）喂给 prompt，让新查询优先复用已有类目；excludeWord 用于排除被查词自身，避免复用锁定旧路径 */
  async getKnownCategoryPaths(limit = 30, excludeWord?: string) {
    const HTE_TRUNKS = ['外部世界', '精神世界', '社会世界'];
    const { items } = await this.getCategoryGroups(excludeWord);
    const paths: { path: string; count: number }[] = [];
    const walk = (
      nodes: { label: string; count: number; words: unknown[]; children: unknown[] }[],
      prefix: string[],
    ) => {
      for (const node of nodes) {
        const path = [...prefix, node.label];
        if (node.words.length) {
          paths.push({ path: path.join('/'), count: node.count });
        }
        walk(node.children as typeof nodes, path);
      }
    };
    walk(items.filter((item: { label: string }) => HTE_TRUNKS.includes(item.label)), []);
    return paths
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((item) => item.path);
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
    const knownCategoryPaths = await this.dictionaryService.getKnownCategoryPaths(30, word);
    await this.aiService.stream({
      recordId: existingRecord ? saved.aiRecordId : undefined,
      regenerate: !!data.isRegenerate,
      bizId: DICTIONARY_BIZ_ID,
      question: word,
      prompt: this.dictionaryService.buildPrompt({ word, knownCategoryPaths }),
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
  @Get('categories')
  async categories() {
    return this.dictionaryService.getCategoryGroups();
  }

  @Public()
  @Get('learning')
  async learning(
    @Query('limit', new OptionalParseIntPipe()) limit: number | undefined,
  ) {
    return this.dictionaryService.getLearningWords(limit);
  }

  @Public()
  @Post('learning/add')
  async addLearning(@Body() data: { text?: string }) {
    return this.dictionaryService.addLearningWords(`${data?.text || ''}`);
  }

  @Public()
  @Post('learning/delete')
  async deleteLearning(@Body() dto: DeleteWordDTO) {
    return this.dictionaryService.deleteLearningWord(dto?.word || '');
  }
}

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: DICTIONARY_MODEL_NAME, schema: DictionarySchema },
      { name: DICTIONARY_LEARNING_MODEL_NAME, schema: DictionaryLearningSchema },
    ]),
  ],
  controllers: [DictionaryController],
  providers: [DictionaryService],
})
export class DictionaryModule {}
