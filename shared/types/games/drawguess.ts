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
  TurnBeforeDuration: 3000,
  TurnDuration: 12000,
  TurnAfterDuration: 2000,
}

/**
 * game msg types
 */
export const DrawGuessCustomMsgTypes = {
  DrawStroke: 'drawStroke',
  SyncStrokes: 'syncStrokes',
  ClearCanvas: 'clearCanvas',
  SyncReplayData: 'syncReplayData',
  Vote: 'vote',
  ChangeWord: 'changeWord',
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
export type ReplayData = { drawerId: string, strokes: StrokeChunk[], turn: number, word: string }

export type Vote = number
export type VoteDTO = Vote[]

export const DrawGuessChatMsgTypes = {
  GuessCorrect: 'guess-correct',
}

export interface DrawGuessRoundUserResult extends RoundUserResult {
  isWinner: boolean
}