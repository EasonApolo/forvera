export type RoomStatus = 'waiting' | 'playing' | 'settlement'
export type RoundStatus = 'before' | 'ing' | 'after'
export type TurnStatus = 'before' | 'ing' | 'after'
export type ReadyStatus = 'ready' | 'end' | null

export interface IGameUser {
  id: string
  name: string
  clientId: string
  connectStatus: 'connected' | 'disconnected'
  readyStatus: ReadyStatus
}

export interface IGameRoom {
  id: string
  status: RoomStatus
  hostId: string

  users: { [userId: string]: IGameUser }
  userOrder: string[]

  turn: number // 回合
  turnStatus: TurnStatus

  round: number // 局
  roundStatus: RoundStatus

  startTime: number
  duration: number

  roundResults: RoundResult[]
}

/**
 * round results
 */
export interface RoundResult {
  round: number
  users: { [userId: string]: RoundUserResult }
}
export interface RoundUserResult {
  [key: string]: any
}

/**
 * chat
 */
export type ChatMessageType = 'chat' | 'system' | string
export interface ChatMessage {
  id: number | string
  type: ChatMessageType
  userName?: string
  content: string
}
export type ChatInstructionType = 'cover' | string
export interface ChatInstruction {
  type: ChatInstructionType
  content: Partial<ChatMessage>
}

export namespace GameDTO {
  export interface Connection {
    roomId: string
    userId: string
  }
}

/**
 * ws
 */
export interface WsEventMsg {
  seq: number
  t: number
  data: any
}
export const WsCustomMsgName = 'msg'
export interface WsCustomMsg {
  type: string
  data: any
}

/**
 * common utils
 */
export type Coord = {
  x: number
  y: number
}
