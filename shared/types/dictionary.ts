

// ==================== data schema ====================

export type DictionaryDefinition = {
  meaning: string
  /** 该词义的特殊读音（IPA，含斜杠），如某词性重音位移；无则省略 */
  phonetic?: string | null
  example: string
  exampleTranslation: string
  /** 该词义的 3~5 层通用分类路径（从大类到小类） */
  classification: string[]
  synonymsAnalysis: {
    term: string
    isOriginalWord: boolean
    usageShare: number
    usageContext: string
    note?: string
  }[]
}

export type DictionaryMeaning = {
  partOfSpeech: string
  definitions: DictionaryDefinition[]
}

export type DictionaryWordAnalysis = {
  isWordValid: boolean
  searchedWord: string
  canonicalWord: string
  invalidReason?: string | null
  /** 输入疑似拼写错误时模型推断的正确原形；无则为空 */
  correctedWord?: string | null
  word: string
  /** 主要音标：英式/美式（IPA，含斜杠）；相同时可只填一个 */
  pronunciation?: {
    british?: string | null
    american?: string | null
  } | null
  /** 全词最简洁释义，各词义用中文分号；分隔，如「铲子；黑桃花色；铲子挖掘」 */
  briefMeanings?: string | null
  rootAnalysis: {
    root: string
    rootMeaning: string
    etymologyStory: string
    cognates: {
      word: string
      explanation: string
    }[]
  }
  meanings: DictionaryMeaning[]
}


// ==================== API ====================

export namespace DictionaryDTO {
  export interface AnalyzeReq {
    word: string
    isRegenerate?: boolean
  }
}


export type DictionaryRecord = {
  _id?: string
  word: string
  root: string
  modelName: string
  analysis: DictionaryWordAnalysis
  createdAt?: string
  updatedAt?: string
}

export interface AnalyzeWordDTO {
  word: string;
  /** 是否跳过缓存强制重新查询 */
  isRegenerate?: boolean;
}
export interface AnalyzeWordResponse {
  word: string;
  /** 是否为有效单词 */
  isWord: boolean;
  data: DictionaryWordAnalysis
  /** temp数据没有recordId */
  recordId: string | null
}