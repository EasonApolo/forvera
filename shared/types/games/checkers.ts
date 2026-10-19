import type { IGameRoom, IGameUser } from 'shared/types/game.js'

/**
 * checkers game data（2~4 人六角跳棋）
 */
export type CheckersColor = 'yellow' | 'blue' | 'red'

/** 三向坐标 (q, r)，s = -q - r */
export interface CheckersPosition {
  q: number
  r: number
}

export interface CheckersPiece {
  q: number
  r: number
  color: CheckersColor
  playerId: string
}

/** 预走状态：original=源点，current=当前指向的落点；跳棋可连跳，moveKind 记录最后一次移动方式 */
export interface CheckersDraftState {
  original: CheckersPosition
  current: CheckersPosition
  moveKind: 'none' | 'step' | 'jump'
}

export interface ICheckersRoom extends IGameRoom {
  /** 本局参与玩家（按轮转顺序，最多 4 人；其余为观战） */
  playerIds: string[]
  playerCount: number
  /** 当前轮到走子的玩家 */
  currentPlayerId: string
  pieces: CheckersPiece[]
  /** 本局胜者（round 结束时有值） */
  winnerId: string
  /** 各玩家公开的预走状态（所有人可见 ghost 棋子） */
  drafts: Record<string, CheckersDraftState | null>
  /** 每个玩家要占领的目标三角区下标（起始区的对面） */
  targetZones: Record<string, number>
  /** 最近一手落点（高亮用） */
  latestMove: CheckersPosition | null
}

export interface ICheckersUser extends IGameUser {
  totalScore: number
  /** 本局棋色（跳棋房间内有效） */
  color: string
}

/**
 * game msg types
 */
export const CheckersCustomMsgTypes = {
  Click: 'checkersClick',
  Confirm: 'checkersConfirm',
  Cancel: 'checkersCancel',
} as const

/** 服务端私发给点棋者的错误提示（toast 用） */
export const CheckersNoticeEvent = 'checkersNotice'
