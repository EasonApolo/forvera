import type { IGameRoom, IGameUser, RoundUserResult } from 'shared/types/game.js'

/**
 * game data
 */
export interface IDrawGuessRoom extends IGameRoom {
  category: string
  wordLength: number
  word: string
  correctUserIds: string[]
  drawerId: string
  strokes: StrokeChunk[]
  maxRounds: number
  turnStartTime: number
  turnDuration: number
  replayData: { [turn: number]: ReplayData }
  /** 当前 turn 画作的点赞/点踩计数（after 阶段累加，turn 结束时存入 replayData） */
  likes: number
  dislikes: number
}
export interface IDrawGuessUser extends IGameUser {
  totalScore: number
  turnScore: number
}

/**
 * game durations
 */
export const DrawGuessDurations = {
  CategoryHintDelay: 12000,
  WordLengthHintDelay: 24000,
  /** 换词窗口：绘制开始后这么多毫秒内画家仍可换词 */
  ChangeWordWindow: 35000,
  TurnBeforeDuration: 3000,
  TurnDuration: 90000,
  TurnAfterDuration: 8000,
}

/**
 * game msg types
 */
export const DrawGuessCustomMsgTypes = {
  DrawStroke: 'drawStroke',
  SyncStrokes: 'syncStrokes',
  ClearCanvas: 'clearCanvas',
  SyncReplayData: 'syncReplayData',
  ChangeWord: 'changeWord',
  /** server → client：画家换了词（发给除画家外的玩家，用于 toast 提示） */
  WordChanged: 'wordChanged',
  /** client → server：点赞点踩（'like' | 'dislike' | null 取消） */
  Reaction: 'reaction',
}

/**
 * game msg data types
 */
export type SyncStrokeDTO = StrokeChunk[]
export interface StrokeChunk {
  id: number
  start: number
  end: number
  color: string
  width: number
  points: [number, number][]
}
export type ReplayData = { drawerId: string, strokes: StrokeChunk[], turn: number, word: string, likes: number, dislikes: number }

export type DrawGuessReaction = 'like' | 'dislike'

export const DrawGuessChatMsgTypes = {
  GuessCorrect: 'guess-correct',
}

export interface DrawGuessRoundUserResult extends RoundUserResult {
  isWinner: boolean
}