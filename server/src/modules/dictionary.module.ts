import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  Query,
} from '@nestjs/common'
import { InjectModel, MongooseModule } from '@nestjs/mongoose'
import { Model, Schema, Document } from 'mongoose'
import { GoogleGenAI, Type, type Schema as GenAISchema } from '@google/genai'
import { Public } from 'src/guards/jwt-auth.guard'
import { OptionalParseIntPipe } from 'src/shared/parse-int.pipe'
import { DictionaryRecord, DictionaryWordAnalysis } from 'shared/types/dictionary'

const DICTIONARY_MODEL_NAME = 'DictionaryRecord'

interface DictionaryDocument extends Document {
  word: string
  wordLower: string
  root: string
  modelName: string
  analysis: DictionaryWordAnalysis
  createdAt?: Date
  updatedAt?: Date
}

const DictionarySchema = new Schema<DictionaryDocument>(
  {
    word: { type: String, required: true, index: true },
    wordLower: { type: String, required: true, index: true },
    root: { type: String, required: true, default: '' },
    modelName: { type: String, required: true },
    analysis: { type: Schema.Types.Mixed, required: true },
  },
  {
    collection: 'dictionary',
    timestamps: true,
  },
)

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
    word: { type: Type.STRING, description: '最终用于展示和入库的词形（与 canonicalWord 一致）' },
    rootAnalysis: {
      type: Type.OBJECT,
      description: '词根解析、词源演变故事及同根词',
      nullable: true,
      properties: {
        root: {
          type: Type.STRING,
          description: '纯英文词根/前后缀，只能包含英文字母和连字符；若无独立词根，回退为 canonicalWord',
        },
        rootMeaning: {
          type: Type.STRING,
          description: '词根中文含义和来源说明；若无独立词根需注明原生词/拟声词/借词等',
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
                meaning: { type: Type.STRING, description: '极简中文释义，禁止冗余括号解释' },
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
                      isOriginalWord: { type: Type.BOOLEAN, description: '是否原词' },
                      usageShare: { type: Type.NUMBER, description: '该词义下使用率百分比' },
                      usageContext: { type: Type.STRING, description: '语境差异' },
                      note: { type: Type.STRING, description: '补充说明' },
                    },
                    required: ['term', 'isOriginalWord', 'usageShare', 'usageContext'],
                  },
                },
              },
              required: ['meaning', 'example', 'exampleTranslation', 'synonymsAnalysis'],
            },
          },
        },
        required: ['partOfSpeech', 'definitions'],
      },
    },
  },
  required: ['isWordValid', 'searchedWord', 'canonicalWord', 'word', 'meanings'],
}

class AnalyzeWordDTO {
  word!: string
  isoverwirte?: boolean
}

class OverwriteWordDTO {
  word!: string
}

class DeleteWordDTO {
  word!: string
}

@Injectable()
class DictionaryService {
  private readonly modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  private tempOverwrite:
    | {
        word: string
        wordLower: string
        analysis: DictionaryWordAnalysis
        updatedAt: Date
      }
    | null = null

  constructor(
    @InjectModel(DICTIONARY_MODEL_NAME)
    private readonly dictionaryModel: Model<DictionaryDocument>,
  ) {}

  private formatErrorDetail(err: unknown) {
    const parts: string[] = []
    const target = (err || {}) as any

    if (target.name) parts.push(`name=${target.name}`)
    if (target.message) parts.push(`message=${target.message}`)
    if (target.code) parts.push(`code=${target.code}`)

    const cause = target.cause as any
    if (cause) {
      if (cause.name) parts.push(`cause.name=${cause.name}`)
      if (cause.message) parts.push(`cause.message=${cause.message}`)
      if (cause.code) parts.push(`cause.code=${cause.code}`)
    }

    if (target.response?.status) parts.push(`response.status=${target.response.status}`)
    if (target.response?.statusText) parts.push(`response.statusText=${target.response.statusText}`)

    return parts.filter(Boolean).join('; ') || String(err)
  }

  private isSubsequence(text: string, pattern: string) {
    let i = 0
    let j = 0
    while (i < text.length && j < pattern.length) {
      if (text[i] === pattern[j]) {
        j++
      }
      i++
    }
    return j === pattern.length
  }

  private getMatchRank(wordLower: string, keywordLower: string) {
    if (!keywordLower) return 0
    if (wordLower.startsWith(keywordLower)) return 0
    if (wordLower.includes(keywordLower)) return 1
    if (this.isSubsequence(wordLower, keywordLower)) return 2
    return 3
  }

  private normalizeWordAnalysis(inputWord: string, raw: DictionaryWordAnalysis) {
    const canonicalWord = `${raw?.canonicalWord || raw?.word || inputWord}`.trim() || inputWord
    const isWordValid = !!raw?.isWordValid
    const fallbackRoot = canonicalWord
    const normalizedRoot = `${raw?.rootAnalysis?.root || ''}`.trim() || fallbackRoot
    const normalizedRootMeaning = `${raw?.rootAnalysis?.rootMeaning || ''}`.trim()
    const normalizedEtymologyStory = `${raw?.rootAnalysis?.etymologyStory || ''}`.trim()

    return {
      isWordValid,
      searchedWord: inputWord,
      canonicalWord,
      word: canonicalWord,
      invalidReason: raw?.invalidReason ?? null,
      rootAnalysis: {
        root: normalizedRoot,
        rootMeaning: normalizedRootMeaning || '原生词/拟声词/借词，无独立词根',
        etymologyStory:
          normalizedEtymologyStory ||
          '该词常用为基础词或借词场景，建议结合其常见使用语境记忆；若无清晰词根链路，可用 canonicalWord 作为记忆锚点。',
        cognates: Array.isArray(raw?.rootAnalysis?.cognates)
          ? raw.rootAnalysis.cognates.map((item: any) => ({
              word: `${item?.word || ''}`,
              explanation: `${item?.explanation || ''}`,
            }))
          : [],
      },
      meanings: Array.isArray(raw?.meanings)
        ? raw.meanings.map((meaning: any) => ({
            partOfSpeech: `${meaning?.partOfSpeech || ''}`,
            definitions: Array.isArray(meaning?.definitions)
              ? meaning.definitions.map((def: any) => ({
                  meaning: `${def?.meaning || ''}`,
                  example: `${def?.example || ''}`,
                  exampleTranslation: `${def?.exampleTranslation || ''}`,
                  synonymsAnalysis: Array.isArray(def?.synonymsAnalysis)
                    ? def.synonymsAnalysis.map((syn: any) => ({
                        term: `${syn?.term || ''}`,
                        isOriginalWord: !!syn?.isOriginalWord,
                        usageShare: Number(syn?.usageShare || 0),
                        usageContext: `${syn?.usageContext || ''}`,
                        note: syn?.note ? `${syn.note}` : undefined,
                      }))
                    : [],
                }))
              : [],
          }))
        : [],
    } as DictionaryWordAnalysis
  }

  private async generateWordAnalysis(word: string) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim()
    if (!apiKey) {
      throw new BadRequestException('GEMINI_API_KEY is empty')
    }

    const ai = new GoogleGenAI({ apiKey })
    const prompt = `你是一个严谨的英语词典分析助手。请分析输入的字符串："${word}"。

  严格遵守以下要求：
  1. 有效性与原形检查：
  - 若不是有效单词，isWordValid 设为 false。
  - 若输入是变形词（如 added, buzzing），searchedWord 保留原输入，canonicalWord 返回原形（如 add, buzz）。

  2. 词根与演变故事（重点更新）：
  - root 字段必须且只能填写纯英文词根/前缀/后缀字符串，只允许英文字母和连字符，不得包含中文、括号或其他符号。
  - 正确示例："chop-"、"ad-"、"vis-"。
  - 错误示例："chop- (切，砍)"、"ad- (去，往)"。
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
  - 每个词义下必须包含原词本身、同义词和同义短语，usageShare 加和必须为 100。`

    let response: any
    try {
      response = await ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: WordAnalysisSchema,
          temperature: 0.2,
        },
      })
    } catch (err) {
      throw new BadRequestException(
        `Gemini request failed: ${this.formatErrorDetail(err)}`,
      )
    }

    if (!response.text) {
      throw new BadRequestException(
        `Gemini empty response: ${this.formatErrorDetail(response)}`,
      )
    }

    try {
      return JSON.parse(response.text) as DictionaryWordAnalysis
    } catch (err) {
      const textSnippet = String(response.text || '').slice(0, 500)
      throw new BadRequestException(
        `Gemini returned invalid JSON: ${this.formatErrorDetail(err)}; response.text=${textSnippet}`,
      )
    }
  }

  async analyzeWord(dto: AnalyzeWordDTO) {
    const searchedWord = `${dto?.word || ''}`.trim()
    if (!searchedWord) {
      throw new BadRequestException('word is required')
    }

    const searchedWordLower = searchedWord.toLowerCase()
    const isoverwirte = !!dto?.isoverwirte

    if (this.tempOverwrite?.wordLower === searchedWordLower && !isoverwirte) {
      return {
        success: true,
        exists: true,
        cached: false,
        isoverwirte: true,
        word: this.tempOverwrite.word,
        data: this.tempOverwrite.analysis,
        recordId: null,
        updatedAt: this.tempOverwrite.updatedAt,
      }
    }

    const cached = await this.dictionaryModel
      .findOne({ wordLower: searchedWordLower })
      .sort({ createdAt: -1 })
      .lean()

    if (cached && !isoverwirte) {
      return {
        success: true,
        exists: true,
        cached: true,
        isoverwirte: false,
        word: cached.word,
        data: cached.analysis,
        recordId: String(cached._id),
        updatedAt: cached.updatedAt,
      }
    }

    const generated = await this.generateWordAnalysis(searchedWord)
    const analysis = this.normalizeWordAnalysis(searchedWord, generated)
    const canonicalWord = `${analysis.canonicalWord || searchedWord}`.trim()
    const canonicalWordLower = canonicalWord.toLowerCase()

    if (!analysis.isWordValid) {
      return {
        success: true,
        exists: false,
        cached: false,
        isoverwirte: false,
        word: canonicalWord,
        message: '这个词不存在',
        data: analysis,
        recordId: null,
        updatedAt: null,
      }
    }

    if (!isoverwirte) {
      if (this.tempOverwrite?.wordLower === canonicalWordLower) {
        return {
          success: true,
          exists: true,
          cached: false,
          isoverwirte: true,
          word: this.tempOverwrite.word,
          data: this.tempOverwrite.analysis,
          recordId: null,
          updatedAt: this.tempOverwrite.updatedAt,
        }
      }

      const canonicalCached = await this.dictionaryModel
        .findOne({ wordLower: canonicalWordLower })
        .sort({ createdAt: -1 })
        .lean()

      if (canonicalCached) {
        return {
          success: true,
          exists: true,
          cached: true,
          isoverwirte: false,
          word: canonicalCached.word,
          data: canonicalCached.analysis,
          recordId: String(canonicalCached._id),
          updatedAt: canonicalCached.updatedAt,
        }
      }
    }

    if (isoverwirte) {
      this.tempOverwrite = {
        word: canonicalWord,
        wordLower: canonicalWordLower,
        analysis,
        updatedAt: new Date(),
      }

      return {
        success: true,
        exists: true,
        cached: false,
        isoverwirte: true,
        word: canonicalWord,
        data: analysis,
        recordId: null,
        updatedAt: this.tempOverwrite.updatedAt,
      }
    }

    const created = await this.dictionaryModel.create({
      word: canonicalWord,
      wordLower: canonicalWordLower,
      root: analysis.rootAnalysis.root,
      modelName: this.modelName,
      analysis,
    })

    return {
      success: true,
      exists: true,
      cached: false,
      isoverwirte: false,
      word: canonicalWord,
      data: analysis,
      recordId: String(created._id),
      updatedAt: created.updatedAt,
    }
  }

  async overwriteWord(dto: OverwriteWordDTO) {
    const word = `${dto?.word || ''}`.trim()
    if (!word) {
      throw new BadRequestException('word is required')
    }

    if (!this.tempOverwrite) {
      throw new BadRequestException('temporary overwrite result not found')
    }

    const wordLower = word.toLowerCase()
    if (this.tempOverwrite.wordLower !== wordLower) {
      throw new BadRequestException('temporary overwrite word mismatch')
    }

    const record = await this.dictionaryModel
      .findOneAndUpdate(
        { wordLower },
        {
          word,
          wordLower,
          root: this.tempOverwrite.analysis.rootAnalysis.root,
          modelName: this.modelName,
          analysis: this.tempOverwrite.analysis,
        },
        {
          upsert: true,
          new: true,
        },
      )
      .lean()

    this.tempOverwrite = null

    return {
      success: true,
      item: {
        _id: String(record?._id),
        word: record?.word,
        wordLower: record?.wordLower,
        root: record?.root || '',
        modelName: record?.modelName,
        analysis: record?.analysis,
        createdAt: record?.createdAt ? record.createdAt.toISOString() : undefined,
        updatedAt: record?.updatedAt ? record.updatedAt.toISOString() : undefined,
      } as DictionaryRecord,
    }
  }

  async deleteWord(dto: DeleteWordDTO) {
    const word = `${dto?.word || ''}`.trim()
    if (!word) {
      throw new BadRequestException('word is required')
    }

    const wordLower = word.toLowerCase()
    const deleted = await this.dictionaryModel.deleteMany({ wordLower })

    const tempCleared = !!this.tempOverwrite && this.tempOverwrite.wordLower === wordLower
    if (tempCleared) {
      this.tempOverwrite = null
    }

    return {
      success: true,
      deletedCount: deleted.deletedCount || 0,
      tempCleared,
    }
  }

  async searchWords(keyword: string, limit = 20) {
    const normalized = `${keyword || ''}`.trim().toLowerCase()
    const safeLimit = Math.min(Math.max(limit, 1), 50)

    const rows = await this.dictionaryModel
      .find({}, { word: 1, wordLower: 1, updatedAt: 1, createdAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(500)
      .lean()

    const dedup = new Map<string, any>()
    for (const row of rows) {
      if (!row.wordLower || dedup.has(row.wordLower)) continue
      dedup.set(row.wordLower, row)
    }

    const ranked = Array.from(dedup.values())
      .map((row) => {
        const rank = this.getMatchRank(row.wordLower, normalized)
        return {
          row,
          rank,
          index: normalized ? row.wordLower.indexOf(normalized) : 0,
          ts: row.updatedAt ? row.updatedAt.getTime() : 0,
        }
      })
      .filter((item) => (normalized ? item.rank < 3 : true))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank
        if (a.index !== b.index) return a.index - b.index
        return b.ts - a.ts
      })
      .slice(0, normalized ? safeLimit : Math.min(safeLimit, 5))

    return {
      success: true,
      items: ranked.map(({ row }) => ({
        _id: String(row._id),
        word: row.word,
        wordLower: row.wordLower,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
      })) as Partial<DictionaryRecord>[],
    }
  }

  async getRecent(limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100)
    const rows = await this.dictionaryModel
      .find({}, { word: 1, wordLower: 1, root: 1, modelName: 1, createdAt: 1, updatedAt: 1 })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()

    return {
      success: true,
      items: rows.map((row) => ({
        _id: String(row._id),
        word: row.word,
        wordLower: row.wordLower,
        root: row.root || '',
        modelName: row.modelName,
        createdAt: row.createdAt ? row.createdAt.toISOString() : undefined,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
      } as Partial<DictionaryRecord>)),
    }
  }

  async getRootGroups() {
    const rows = await this.dictionaryModel
      .find({}, { word: 1, wordLower: 1, root: 1, updatedAt: 1 })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean()

    const latestByWord = new Map<string, any>()
    for (const row of rows) {
      if (!row.wordLower || latestByWord.has(row.wordLower)) continue
      latestByWord.set(row.wordLower, row)
    }

    const groups = new Map<
      string,
      {
        root: string
        count: number
        words: { word: string; wordLower: string; updatedAt?: string }[]
      }
    >()

    for (const row of latestByWord.values()) {
      const rootValue = `${row.root || ''}`.trim()
      const key = rootValue || '__NO_ROOT__'
      const group =
        groups.get(key) ||
        {
          root: rootValue,
          count: 0,
          words: [],
        }

      group.words.push({
        word: row.word,
        wordLower: row.wordLower,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : undefined,
      })
      group.count += 1
      groups.set(key, group)
    }

    const items = Array.from(groups.values())
      .sort((a, b) => {
        const aIsEmpty = !a.root
        const bIsEmpty = !b.root
        if (aIsEmpty !== bIsEmpty) return aIsEmpty ? 1 : -1
        if (a.root !== b.root) return a.root.localeCompare(b.root)
        return b.count - a.count
      })
      .map((group) => ({
        root: group.root,
        label: group.root || '无词根',
        count: group.count,
        words: group.words.sort((a, b) => a.word.localeCompare(b.word)),
      }))

    return {
      success: true,
      items,
    }
  }
}

@Controller('api/dictionary')
class DictionaryController {
  constructor(private readonly dictionaryService: DictionaryService) {}

  @Public()
  @Post('analyze')
  async analyze(@Body() dto: AnalyzeWordDTO) {
    return this.dictionaryService.analyzeWord(dto)
  }

  @Public()
  @Post('overwrite')
  async overwrite(@Body() dto: OverwriteWordDTO) {
    return this.dictionaryService.overwriteWord(dto)
  }

  @Public()
  @Post('delete')
  async delete(@Body() dto: DeleteWordDTO) {
    return this.dictionaryService.deleteWord(dto)
  }

  @Public()
  @Get('recent')
  async recent(
    @Query('limit', new OptionalParseIntPipe()) limit: number | undefined,
  ) {
    return this.dictionaryService.getRecent(limit)
  }

  @Public()
  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('limit', new OptionalParseIntPipe()) limit: number | undefined,
  ) {
    return this.dictionaryService.searchWords(q, limit)
  }

  @Public()
  @Get('roots')
  async roots() {
    return this.dictionaryService.getRootGroups()
  }
}

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DICTIONARY_MODEL_NAME, schema: DictionarySchema },
    ]),
  ],
  controllers: [DictionaryController],
  providers: [DictionaryService],
})
export class DictionaryModule {}
