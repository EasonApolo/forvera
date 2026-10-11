import type { IGameRoom, IGameUser } from 'shared/types/game.js'

/**
 * gomoku game data
 */
export const GOMOKU_BOARD_SIZE = 15

export type GomokuColor = 'black' | 'white'

export interface IGomokuRoom extends IGameRoom {
  blackUserId: string
  whiteUserId: string
  /** 当前轮到落子的玩家 */
  currentPlayerId: string
  /** 15x15 棋盘，board[y][x] */
  board: (GomokuColor | '')[]
  /** 最后一手的落子玩家（悔棋判定用；悔棋后清空，直到有新落子） */
  lastMoveUserId: string
  /** 本局胜者（round 结束时有值） */
  winnerId: string
  isDraw: boolean
  lastMove: { x: number; y: number } | null
}

export interface IGomokuUser extends IGameUser {
  totalScore: number
}

/**
 * game msg types
 */
export const GomokuCustomMsgTypes = {
  PlaceStone: 'placeStone',
  Resign: 'resign',
  Undo: 'undo',
} as const

export interface PlaceStoneDTO {
  x: number
  y: number
}
