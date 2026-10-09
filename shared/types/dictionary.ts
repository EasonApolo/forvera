

// ==================== data schema ====================

export type DictionaryDefinition = {
  meaning: string
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