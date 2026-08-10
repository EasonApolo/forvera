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
}
export interface IDrawGuessUser extends IGameUser {
  totalScore: number
  turnScore: number
}

/**
 * game durations
 */
export const DrawGuessDurations = {
  CategoryHintDelay: 2000,
  WordLengthHintDelay: 4000,
  TurnDuration: 90000,
  TurnAfterDuration: 2000,
}

/**
 * game msg types
 */
export const DrawGuessCustomMsgTypes = {
  DrawStroke: 'drawStroke',
  SyncStrokes: 'syncStrokes',
  ClearCanvas: 'clearCanvas',
}

/**
 * game msg data types
 */
export type SyncStrokeDTO = StrokeChunk[]
export interface StrokeChunk {
  id: number
  color: string
  width: number
  points: [number, number][]
}

export const DrawGuessChatMsgTypes = {
  GuessCorrect: 'guess-correct',
}

export interface DrawGuessRoundUserResult extends RoundUserResult {
  isWinner: boolean
}