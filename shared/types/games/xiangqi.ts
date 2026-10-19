import type { IGameRoom, IGameUser } from 'shared/types/game.js'

/**
 * xiangqi game data
 */
export const XIANGQI_COLS = 9
export const XIANGQI_ROWS = 10

export type XiangqiColor = 'black' | 'white'
export type XiangqiPieceType =
  | 'rook'
  | 'horse'
  | 'elephant'
  | 'advisor'
  | 'general'
  | 'cannon'
  | 'soldier'

export interface XiangqiPiece {
  x: number
  y: number
  type: XiangqiPieceType
  color: XiangqiColor
  playerId: string
}

/** 选中/预走势图：original=源点，current=当前指向的落点（未确认时可等于源点） */
export interface XiangqiDraftState {
  original: { x: number; y: number }
  current: { x: number; y: number }
  captured: { x: number; y: number } | null
  moveKind: 'none' | 'move' | 'capture'
}

export interface IXiangqiRoom extends IGameRoom {
  blackUserId: string
  whiteUserId: string
  /** 当前轮到走子的玩家 */
  currentPlayerId: string
  /** 全盘棋子（被吃的已移除） */
  pieces: XiangqiPiece[]
  /** 本局胜者（round 结束时有值） */
  winnerId: string
  /** 各玩家公开的选中/预走状态（所有人可见ghost棋子） */
  drafts: Record<string, XiangqiDraftState | null>
  /** 最近一手落点（高亮用） */
  latestMove: { x: number; y: number } | null
}

export interface IXiangqiUser extends IGameUser {
  totalScore: number
}

/**
 * game msg types
 */
export const XiangqiCustomMsgTypes = {
  Click: 'xiangqiClick',
  Confirm: 'xiangqiConfirm',
  Cancel: 'xiangqiCancel',
  Resign: 'resign',
} as const

/** 服务端私发给点棋者的规则错误提示（toast 用） */
export const XiangqiNoticeEvent = 'xiangqiNotice'
