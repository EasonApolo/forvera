export type DictionaryDefinition = {
  meaning: string
  example: string
  exampleTranslation: string
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

export type DictionaryRecord = {
  _id?: string
  word: string
  wordLower: string
  root: string
  modelName: string
  analysis: DictionaryWordAnalysis
  createdAt?: string
  updatedAt?: string
}
