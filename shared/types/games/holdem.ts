import type { IGameRoom, IGameUser } from 'shared/types/game.js'

/**
 * holdem (德州扑克) game data
 */

export type HoldemCardRank =
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'
  | 'A'
export type HoldemSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades'

export interface HoldemCard {
  rank: HoldemCardRank
  suit: HoldemSuit
  isFacedown: boolean
}

export interface HoldemChip {
  value: number
  count: number
}

export type HoldemPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

/** 摊牌亮牌：userId -> 公开的手牌（本局其他时刻为空对象） */
export type HoldemRevealedCards = Record<string, HoldemCard[]>

export interface IHoldemRoom extends IGameRoom {
  /** 本局入座玩家（按座位顺序，中局加入者不在内，下局自动入座） */
  playerIds: string[]
  /** 当前轮到行动的玩家（空串 = 开牌/结算中） */
  currentPlayerId: string
  communityCards: HoldemCard[]
  gamePhase: HoldemPhase
  winnerIds: string[]
  revealedCards: HoldemRevealedCards
}

export interface IHoldemUser extends IGameUser {
  /** 私有：只有本人能同步到手牌内容，其他人收到 null（由 AutoSyncData private visibility 保证） */
  chips: HoldemChip[]
  betChips: HoldemChip[]
  cards: HoldemCard[]
  /** 本轮已确认的下注基线（“拿回”只会回退这轮新增的部分） */
  betSum: number
  isAsked: boolean
  isQuitBet: boolean
  isAllIn: boolean
  isSmallBlind: boolean
  isBigBlind: boolean
  /** 银行余额：贷款欠款为负、存款为正，0 = 与银行无往来（前端显示 银行+/-xxx 徽标） */
  bankBalance: number
}

/**
 * game msg types
 */
export const HoldemMsgTypes = {
  AddChip: 'holdemAddChip',
  RemoveChip: 'holdemRemoveChip',
  ConfirmBet: 'holdemConfirmBet',
  Call: 'holdemCall',
  QuitBet: 'holdemQuitBet',
  TakeBackBetChips: 'holdemTakeBackBetChips',
  AllIn: 'holdemAllIn',
  ExchangeToSmallChips: 'holdemExchangeToSmallChips',
  ExchangeToLargeChips: 'holdemExchangeToLargeChips',
  Loan: 'holdemLoan',
  Repay: 'holdemRepay',
} as const

/** 服务端私发给操作者的错误提示（toast 用） */
export const HoldemNoticeEvent = 'holdemNotice'

/** 广播玩家动作（加注/跟注/弃牌/梭哈），用于动作气泡 */
export const HoldemUserActionEvent = 'holdemUserAction'

export const HoldemBlinds = {
  Small: 5,
  Big: 10,
} as const

/** 一条街下完后翻公共牌的停顿时长（与旧版一致） */
export const HoldemDealingDuration = 5000
