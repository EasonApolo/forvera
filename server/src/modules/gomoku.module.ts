import { Controller, Delete, Get, Module, Param, Post } from '@nestjs/common'
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Public, Roles } from 'src/guards/jwt-auth.guard'

const BOARD_SIZE = 15
const DEBUG_CHECKERS_ENDGAME_PRESET = false

type GomokuColor = 'black' | 'white'

type CheckersColor = 'yellow' | 'blue' | 'red'
type XiangqiColor = 'black' | 'white'
type XiangqiPieceType = 'rook' | 'horse' | 'elephant' | 'advisor' | 'general' | 'cannon' | 'soldier'

type BlackSelectionMode = 'random' | 'loser'

type GameMode = 'gomoku' | 'xiangqi' | 'checkers' | 'cs'

type BoardPatch =
  | {
      type: 'reset'
      board: (GomokuColor | '')[][]
    }
  | {
      type: 'add' | 'update' | 'delete'
      x: number
      y: number
      color: GomokuColor | ''
    }

type CheckersBoardPatch =
  | {
      type: 'reset'
      pieces: Array<{ q: number; r: number; color: CheckersColor; playerId: string }>
    }
  | {
      type: 'move'
      from: { q: number; r: number }
      to: { q: number; r: number }
      playerId: string
    }

interface CheckersPosition {
  q: number
  r: number
}

interface CheckersPiece {
  q: number
  r: number
  color: CheckersColor
  playerId: string
}

interface CheckersDraftState {
  original: CheckersPosition
  current: CheckersPosition
  moveKind: 'none' | 'step' | 'jump'
}

interface XiangqiPiece {
  x: number
  y: number
  type: XiangqiPieceType
  color: XiangqiColor
  playerId: string
}

interface XiangqiDraftState {
  original: { x: number; y: number }
  current: { x: number; y: number }
  captured: { x: number; y: number } | null
  moveKind: 'none' | 'move' | 'capture'
}

type ConnectStatus = 'connected' | 'disconnected'

type RoomStatus = 'waiting' | 'playing' | 'settlement'

interface GomokuUser {
  id: string
  name: string
  clientId: string
  connectStatus: ConnectStatus
  color: GomokuColor | CheckersColor | ''
  readyStatus: 'ready' | 'end' | null
}

interface GomokuMove {
  x: number
  y: number
  userId: string
  color: GomokuColor
  timestamp: number
}

interface GomokuRecord {
  round: number
  winnerId: string
  winnerName: string
  color: GomokuColor | CheckersColor
  timestamp: number
}

interface GomokuRoom {
  id: string
  status: RoomStatus
  users: GomokuUser[]
  hostId: string
  blackSelectionMode: BlackSelectionMode
  currentGameMode: GameMode
  nextGameMode: GameMode
  round: number
  currentPlayerId: string
  blackUserId: string
  whiteUserId: string
  board: (GomokuColor | '')[][]
  moves: GomokuMove[]
  winnerId: string
  records: GomokuRecord[]
  turnStartedAt: number
  lastMoveDurations: Record<string, number>
  // 跳棋相关
  checkersPieces: CheckersPiece[]
  checkersPlayerCount: number
  checkersDrafts: Record<string, CheckersDraftState | null>
  checkersTargetZones: Record<string, number>
  // 象棋相关
  xiangqiPieces: XiangqiPiece[]
  xiangqiDrafts: Record<string, XiangqiDraftState | null>
}

function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => '' as GomokuColor | ''),
  ) as (GomokuColor | '')[][]
}

function cloneBoard(board: (GomokuColor | '')[][]) {
  return board.map((row) => [...row])
}

function shuffleTwo<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5)
}

// 跳棋棋盘生成函数
function generateCheckersBoard(): CheckersPosition[] {
  const positions: CheckersPosition[] = []

  // 中心六边形
  for (let r = -4; r <= 4; r++) {
    for (let q = Math.max(-4, -r - 4); q <= Math.min(4, -r + 4); q++) {
      positions.push({ q, r })
    }
  }
  
  // 上三角 (r<-4): 顶点(4,-8,4)
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      positions.push({ q, r })
    }
  }
  
  // 右上三角 (q>4): 顶点(8,-4,-4)
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      positions.push({ q, r })
    }
  }
  
  // 右下三角 (s<-4): 顶点(4,4,-8)
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      positions.push({ q, r: -q - s })
    }
  }
  
  // 下三角 (r>4): 顶点(-4,8,-4)
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      positions.push({ q, r })
    }
  }
  
  // 左下三角 (q<-4): 顶点(-8,4,4)
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      positions.push({ q, r })
    }
  }
  
  // 左上三角 (s>4): 顶点(-4,-4,8)
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      positions.push({ q, r: -q - s })
    }
  }

  return positions
}

// 获取每个方向的起始区域（三角形）
function getCheckersStartZones() {
  const zones: Record<number, CheckersPosition[]> = {}
  
  // 0: 上 (top, r<-4)
  zones[0] = []
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      zones[0].push({ q, r })
    }
  }
  
  // 1: 右上 (top-right, q>4)
  zones[1] = []
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      zones[1].push({ q, r })
    }
  }
  
  // 2: 右下 (bottom-right, s<-4)
  zones[2] = []
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      zones[2].push({ q, r: -q - s })
    }
  }
  
  // 3: 下 (bottom, r>4)
  zones[3] = []
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      zones[3].push({ q, r })
    }
  }
  
  // 4: 左下 (bottom-left, q<-4)
  zones[4] = []
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      zones[4].push({ q, r })
    }
  }
  
  // 5: 左上 (top-left, s>4)
  zones[5] = []
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      zones[5].push({ q, r: -q - s })
    }
  }
  
  return zones
}

function getCheckersStartZoneIndices(playerCount: number): number[] {
  const shuffle = (arr: number[]) => {
    const next = [...arr]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    return next
  }

  if (playerCount === 2) {
    return [0, 3] // 上、下
  }
  if (playerCount === 3) {
    // 3人采用隔位三角形，并在两套对称布局中随机，避免总是相邻组合
    const patterns = [
      [0, 2, 4],
      [1, 3, 5],
    ]
    const pattern = patterns[Math.floor(Math.random() * patterns.length)]
    return shuffle(pattern)
  }
  if (playerCount === 4) {
    // 4人布局：左上、上、下、右下；随机分配玩家到这四个起始区
    return shuffle([5, 0, 3, 2])
  }
  return []
}

function getOppositeCheckersZoneIndex(zoneIndex: number): number {
  const oppositeMap: Record<number, number> = {
    0: 3,
    1: 4,
    2: 5,
    3: 0,
    4: 1,
    5: 2,
  }
  return oppositeMap[zoneIndex] ?? zoneIndex
}

// 初始化跳棋棋盘
function initCheckersGame(playerCount: number, startZoneIndices: number[]): CheckersPiece[] {
  const pieces: CheckersPiece[] = []
  const zones = getCheckersStartZones()
  // 随机打乱颜色顺序
  const allColors: CheckersColor[] = ['yellow', 'blue', 'red']
  for (let i = allColors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));[allColors[i], allColors[j]] = [allColors[j], allColors[i]]
  }
  const colors = allColors
  
  // 测试残局：双方都已进入对方三角区，且双方都只差一步。
  // 使用方式：把 DEBUG_CHECKERS_ENDGAME_PRESET 改成 true，测试完改回 false。
  if (DEBUG_CHECKERS_ENDGAME_PRESET && playerCount === 2) {
    const topZone = zones[0]
    const bottomZone = zones[3]
    const colorA = colors[0]
    const colorB = colors[1]

    // player0 目标是下方三角：先放9个到下方，最后1个放在(0,4)，距离(-1,5)仅一步。
    const bottomWithoutRightmost = bottomZone.filter((pos) => !(pos.q === -1 && pos.r === 5))
    bottomWithoutRightmost.forEach((pos) => {
      pieces.push({ q: pos.q, r: pos.r, color: colorA, playerId: 'player0' })
    })
    pieces.push({ q: 0, r: 4, color: colorA, playerId: 'player0' })

    // player1 目标是上方三角：先放9个到上方，最后1个放在(4,-4)，距离(4,-5)仅一步。
    const topWithoutRightmost = topZone.filter((pos) => !(pos.q === 4 && pos.r === -5))
    topWithoutRightmost.forEach((pos) => {
      pieces.push({ q: pos.q, r: pos.r, color: colorB, playerId: 'player1' })
    })
    pieces.push({ q: 4, r: -4, color: colorB, playerId: 'player1' })

    return pieces
  }
  
  // 为每个玩家分配棋子
  startZoneIndices.forEach((zoneIndex, playerIndex) => {
    const zone = zones[zoneIndex]
    const color = colors[playerIndex % colors.length]
    const playerId = `player${playerIndex}`
    
    zone.forEach((pos) => {
      pieces.push({
        q: pos.q,
        r: pos.r,
        color,
        playerId,
      })
    })
  })
  
  return pieces
}

const CHECKERS_DIRECTIONS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
] as const

const CHECKERS_BOARD_KEYS = new Set(generateCheckersBoard().map((p) => `${p.q},${p.r}`))

function posKey(pos: CheckersPosition) {
  return `${pos.q},${pos.r}`
}

function samePos(a: CheckersPosition, b: CheckersPosition) {
  return a.q === b.q && a.r === b.r
}

function isInsideCheckersBoard(pos: CheckersPosition) {
  return CHECKERS_BOARD_KEYS.has(posKey(pos))
}

function findPieceAt(pieces: CheckersPiece[], pos: CheckersPosition) {
  return pieces.find((p) => p.q === pos.q && p.r === pos.r)
}

function getEffectivePiecesForDraft(
  pieces: CheckersPiece[],
  userId: string,
  draft: CheckersDraftState | null,
): CheckersPiece[] {
  if (!draft) return pieces
  return pieces.map((piece) => {
    if (piece.playerId === userId && piece.q === draft.original.q && piece.r === draft.original.r) {
      return { ...piece, q: draft.current.q, r: draft.current.r }
    }
    return piece
  })
}

function isAdjacentMove(from: CheckersPosition, to: CheckersPosition) {
  const dq = to.q - from.q
  const dr = to.r - from.r
  return CHECKERS_DIRECTIONS.some((dir) => dir.dq === dq && dir.dr === dr)
}

function getLineJumpLandings(
  occupied: Set<string>,
  from: CheckersPosition,
): CheckersPosition[] {
  const landings: CheckersPosition[] = []

  for (const dir of CHECKERS_DIRECTIONS) {
    let cursor: CheckersPosition = { q: from.q + dir.dq, r: from.r + dir.dr }

    // 必须先遇到至少1个连续棋子
    if (!isInsideCheckersBoard(cursor) || !occupied.has(posKey(cursor))) {
      continue
    }

    // 沿着同方向跨过连续棋子
    while (isInsideCheckersBoard(cursor) && occupied.has(posKey(cursor))) {
      cursor = { q: cursor.q + dir.dq, r: cursor.r + dir.dr }
    }

    // 连续棋子后的第一个空位就是可落点
    if (isInsideCheckersBoard(cursor) && !occupied.has(posKey(cursor))) {
      landings.push(cursor)
    }
  }

  return landings
}

function getReachableJumpTargets(
  pieces: CheckersPiece[],
  userId: string,
  draft: CheckersDraftState,
) {
  const piece = pieces.find(
    (p) => p.playerId === userId && p.q === draft.original.q && p.r === draft.original.r,
  )
  if (!piece) return new Set<string>()

  // 跳棋中被跨越棋子不会移除，只有当前移动棋子的占位会变化。
  const occupiedByOthers = new Set(
    pieces
      .filter((p) => p !== piece)
      .map((p) => `${p.q},${p.r}`),
  )

  const visited = new Set<string>([posKey(draft.current)])
  const queue: CheckersPosition[] = [draft.current]
  const reachable = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift() as CheckersPosition
    const landings = getLineJumpLandings(occupiedByOthers, current)
    for (const landing of landings) {
      const landingKey = posKey(landing)
      if (visited.has(landingKey)) continue

      visited.add(landingKey)
      reachable.add(landingKey)
      queue.push(landing)
    }
  }

  return reachable
}

const XIANGQI_COLS = 9
const XIANGQI_ROWS = 10

function isInsideXiangqiBoard(x: number, y: number) {
  return x >= 0 && x < XIANGQI_COLS && y >= 0 && y < XIANGQI_ROWS
}

function isInsideXiangqiPalace(color: XiangqiColor, x: number, y: number) {
  if (x < 3 || x > 5) return false
  return color === 'black' ? y >= 0 && y <= 2 : y >= 7 && y <= 9
}

function hasPieceBetweenOnLine(
  pieces: XiangqiPiece[],
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  if (from.x !== to.x && from.y !== to.y) {
    return { blocked: true, count: 0 }
  }
  let count = 0
  if (from.x === to.x) {
    const step = from.y < to.y ? 1 : -1
    for (let y = from.y + step; y !== to.y; y += step) {
      if (pieces.some((p) => p.x === from.x && p.y === y)) count += 1
    }
  } else {
    const step = from.x < to.x ? 1 : -1
    for (let x = from.x + step; x !== to.x; x += step) {
      if (pieces.some((p) => p.x === x && p.y === from.y)) count += 1
    }
  }
  return { blocked: false, count }
}

function findXiangqiPieceAt(pieces: XiangqiPiece[], x: number, y: number) {
  return pieces.find((piece) => piece.x === x && piece.y === y)
}

function isGeneralsFacing(pieces: XiangqiPiece[]) {
  const blackGeneral = pieces.find((p) => p.type === 'general' && p.color === 'black')
  const whiteGeneral = pieces.find((p) => p.type === 'general' && p.color === 'white')
  if (!blackGeneral || !whiteGeneral) return false
  if (blackGeneral.x !== whiteGeneral.x) return false
  const minY = Math.min(blackGeneral.y, whiteGeneral.y)
  const maxY = Math.max(blackGeneral.y, whiteGeneral.y)
  for (let y = minY + 1; y < maxY; y += 1) {
    if (pieces.some((piece) => piece.x === blackGeneral.x && piece.y === y)) {
      return false
    }
  }
  return true
}

function canXiangqiPieceMove(
  pieces: XiangqiPiece[],
  piece: XiangqiPiece,
  toX: number,
  toY: number,
) {
  if (!isInsideXiangqiBoard(toX, toY)) {
    return { ok: false, message: '目标位置无效' }
  }

  if (piece.x === toX && piece.y === toY) {
    return { ok: false, message: '目标位置无效' }
  }

  const targetPiece = findXiangqiPieceAt(pieces, toX, toY)
  if (targetPiece && targetPiece.color === piece.color) {
    return { ok: false, message: '不能吃自己的棋子' }
  }

  const dx = toX - piece.x
  const dy = toY - piece.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (piece.type === 'rook') {
    if (piece.x !== toX && piece.y !== toY) {
      return { ok: false, message: '车只能走直线' }
    }
    const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY })
    if (line.blocked || line.count > 0) {
      return { ok: false, message: '路径被阻挡' }
    }
  } else if (piece.type === 'horse') {
    if (!((absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2))) {
      return { ok: false, message: '马走日' }
    }
    const legX = absDx === 2 ? piece.x + dx / 2 : piece.x
    const legY = absDy === 2 ? piece.y + dy / 2 : piece.y
    if (findXiangqiPieceAt(pieces, legX, legY)) {
      return { ok: false, message: '蹩马腿' }
    }
  } else if (piece.type === 'elephant') {
    if (!(absDx === 2 && absDy === 2)) {
      return { ok: false, message: '象走田' }
    }
    if (piece.color === 'black' && toY > 4) {
      return { ok: false, message: '象不能过河' }
    }
    if (piece.color === 'white' && toY < 5) {
      return { ok: false, message: '相不能过河' }
    }
    const eyeX = piece.x + dx / 2
    const eyeY = piece.y + dy / 2
    if (findXiangqiPieceAt(pieces, eyeX, eyeY)) {
      return { ok: false, message: '塞象眼' }
    }
  } else if (piece.type === 'advisor') {
    if (!(absDx === 1 && absDy === 1)) {
      return { ok: false, message: '士走斜一步' }
    }
    if (!isInsideXiangqiPalace(piece.color, toX, toY)) {
      return { ok: false, message: '士只能在九宫内移动' }
    }
  } else if (piece.type === 'general') {
    const isFlyingCapture = targetPiece?.type === 'general' && piece.x === toX
    if (isFlyingCapture) {
      const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY })
      if (line.blocked || line.count !== 0) {
        return { ok: false, message: '将帅之间有阻挡' }
      }
    } else {
      if (absDx + absDy !== 1) {
        return { ok: false, message: '将帅每次只能走一步' }
      }
      if (!isInsideXiangqiPalace(piece.color, toX, toY)) {
        return { ok: false, message: '将帅只能在九宫内移动' }
      }
    }
  } else if (piece.type === 'cannon') {
    if (piece.x !== toX && piece.y !== toY) {
      return { ok: false, message: '炮只能走直线' }
    }
    const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY })
    if (line.blocked) {
      return { ok: false, message: '炮只能走直线' }
    }
    if (!targetPiece && line.count !== 0) {
      return { ok: false, message: '炮平移时路径不能有棋子' }
    }
    if (targetPiece && line.count !== 1) {
      return { ok: false, message: '炮吃子需要隔一个棋子' }
    }
  } else if (piece.type === 'soldier') {
    const forward = piece.color === 'black' ? 1 : -1
    const crossedRiver = piece.color === 'black' ? piece.y >= 5 : piece.y <= 4
    const canSide = crossedRiver && absDx === 1 && dy === 0
    const canForward = dx === 0 && dy === forward
    if (!canForward && !canSide) {
      return { ok: false, message: '兵卒走法不合法' }
    }
  }

  const nextPieces = pieces
    .filter((p) => !(targetPiece && p === targetPiece))
    .map((p) => (p === piece ? { ...p, x: toX, y: toY } : p))
  if (isGeneralsFacing(nextPieces)) {
    return { ok: false, message: '将帅不能照面' }
  }

  return { ok: true, captured: targetPiece || null }
}

function initXiangqiGame(blackUserId: string, whiteUserId: string): XiangqiPiece[] {
  const pieces: XiangqiPiece[] = []
  const place = (x: number, y: number, type: XiangqiPieceType, color: XiangqiColor, playerId: string) => {
    pieces.push({ x, y, type, color, playerId })
  }

  const topMain: XiangqiPieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook']
  topMain.forEach((type, x) => place(x, 0, type, 'black', blackUserId))
  place(1, 2, 'cannon', 'black', blackUserId)
  place(7, 2, 'cannon', 'black', blackUserId)
  ;[0, 2, 4, 6, 8].forEach((x) => place(x, 3, 'soldier', 'black', blackUserId))

  const bottomMain: XiangqiPieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook']
  bottomMain.forEach((type, x) => place(x, 9, type, 'white', whiteUserId))
  place(1, 7, 'cannon', 'white', whiteUserId)
  place(7, 7, 'cannon', 'white', whiteUserId)
  ;[0, 2, 4, 6, 8].forEach((x) => place(x, 6, 'soldier', 'white', whiteUserId))

  return pieces
}

function createRoom(roomId: string, hostId: string): GomokuRoom {
  return {
    id: roomId,
    status: 'waiting',
    users: [],
    hostId,
    blackSelectionMode: 'loser',
    currentGameMode: 'gomoku',
    nextGameMode: 'gomoku',
    round: 0,
    currentPlayerId: '',
    blackUserId: '',
    whiteUserId: '',
    board: createBoard(),
    moves: [],
    winnerId: '',
    records: [],
    turnStartedAt: 0,
    lastMoveDurations: {},
    checkersPieces: [],
    checkersPlayerCount: 2,
    checkersDrafts: {},
    checkersTargetZones: {},
    xiangqiPieces: [],
    xiangqiDrafts: {},
  }
}

function isInsideBoard(x: number, y: number) {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
}

function hasFiveInRow(board: (GomokuColor | '')[][], x: number, y: number, color: GomokuColor) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const

  for (const [dx, dy] of directions) {
    let count = 1

    let nx = x + dx
    let ny = y + dy
    while (isInsideBoard(nx, ny) && board[ny][nx] === color) {
      count += 1
      nx += dx
      ny += dy
    }

    nx = x - dx
    ny = y - dy
    while (isInsideBoard(nx, ny) && board[ny][nx] === color) {
      count += 1
      nx -= dx
      ny -= dy
    }

    if (count >= 5) {
      return true
    }
  }

  return false
}

@WebSocketGateway({ cors: true })
export class GomokuGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  constructor() {
    this.server = {} as Server
  }

  rooms = new Map<string, GomokuRoom>()
  socketToRoom = new Map<string, string>()
  socketToUser = new Map<string, GomokuUser>()

  handleConnection() {}

  handleDisconnect(client: Socket) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      return
    }
    const room = this.rooms.get(roomId)
    if (!room) {
      this.socketToRoom.delete(client.id)
      this.socketToUser.delete(client.id)
      return
    }
    const user = this.socketToUser.get(client.id)
    if (user) {
      // 准备阶段（等待/结算）断开视为直接退出房间
      if (room.status === 'waiting' || room.status === 'settlement') {
        room.users = room.users.filter((member) => member.id !== user.id)
        if (room.hostId === user.id) {
          room.hostId = room.users[0]?.id || ''
        }
        if (room.users.length === 0) {
          this.rooms.delete(roomId)
          this.socketToRoom.delete(client.id)
          this.socketToUser.delete(client.id)
          return
        }
      } else {
        user.connectStatus = 'disconnected'
        if (user.clientId === client.id) {
          user.clientId = ''
        }
      }
    }
    this.socketToRoom.delete(client.id)
    this.socketToUser.delete(client.id)
    this.syncRoomStatus(roomId)
  }

  private getConnectedUsers(room: GomokuRoom) {
    return room.users.filter((user) => user.connectStatus === 'connected')
  }

  private getUser(room: GomokuRoom, userId: string) {
    return room.users.find((user) => user.id === userId)
  }

  private getColorUser(room: GomokuRoom, color: GomokuColor) {
    const userId = color === 'black' ? room.blackUserId : room.whiteUserId
    return userId ? this.getUser(room, userId) : undefined
  }

  private resetReadyStatus(room: GomokuRoom) {
    room.users.forEach((user) => {
      user.readyStatus = null
    })
  }

  private clearAllCheckersDrafts(room: GomokuRoom) {
    room.checkersDrafts = {}
  }

  private clearAllXiangqiDrafts(room: GomokuRoom) {
    room.xiangqiDrafts = {}
  }

  private broadcastCheckersDraftState(roomId: string, userId: string, draft: CheckersDraftState | null) {
    this.broadcast(roomId, 'checkersDraftState', {
      userId,
      draft,
    })
  }

  private broadcastXiangqiDraftState(roomId: string, userId: string, draft: XiangqiDraftState | null) {
    this.broadcast(roomId, 'xiangqiDraftState', {
      userId,
      draft,
    })
  }

  private isCheckersPlayerWon(room: GomokuRoom, userId: string) {
    const targetZoneIndex = room.checkersTargetZones[userId]
    if (targetZoneIndex === undefined) return false

    const targetZone = getCheckersStartZones()[targetZoneIndex] || []
    const targetSet = new Set(targetZone.map((pos) => `${pos.q},${pos.r}`))
    const userPieces = room.checkersPieces.filter((piece) => piece.playerId === userId)
    if (userPieces.length !== 10) return false

    return userPieces.every((piece) => targetSet.has(`${piece.q},${piece.r}`))
  }

  private rotateCheckersTurn(room: GomokuRoom, currentUserId: string) {
    const activeUsers = room.users.filter((u) => u.color === 'yellow' || u.color === 'blue' || u.color === 'red')
    if (activeUsers.length === 0) {
      room.currentPlayerId = ''
      return
    }
    const currentIndex = activeUsers.findIndex((u) => u.id === currentUserId)
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % activeUsers.length : 0
    room.currentPlayerId = activeUsers[nextIndex]?.id || ''
  }

  private confirmXiangqiDraft(room: GomokuRoom, user: GomokuUser, roomId: string) {
    const draft = room.xiangqiDrafts[user.id] || null
    if (!draft || draft.moveKind === 'none') {
      return { success: false, message: '没有可确认的移动', draft }
    }

    const piece = room.xiangqiPieces.find(
      (p) => p.playerId === user.id && p.x === draft.original.x && p.y === draft.original.y,
    )
    if (!piece) {
      return { success: false, message: '原始棋子不存在', draft }
    }

    const rule = canXiangqiPieceMove(room.xiangqiPieces, piece, draft.current.x, draft.current.y)
    if (!rule.ok) {
      return { success: false, message: rule.message || '移动不合法', draft }
    }

    const capturedPiece = findXiangqiPieceAt(room.xiangqiPieces, draft.current.x, draft.current.y)
    if (capturedPiece && capturedPiece.color === piece.color) {
      return { success: false, message: '不能吃自己的棋子', draft }
    }

    if (capturedPiece) {
      room.xiangqiPieces = room.xiangqiPieces.filter((p) => p !== capturedPiece)
    }

    piece.x = draft.current.x
    piece.y = draft.current.y
    room.lastMoveDurations[user.id] = Math.max(0, Date.now() - room.turnStartedAt)
    room.xiangqiDrafts[user.id] = null
    this.broadcastXiangqiDraftState(roomId, user.id, null)

    const capturedGeneral = capturedPiece?.type === 'general'
    if (capturedGeneral) {
      room.winnerId = user.id
      room.status = 'settlement'
      room.currentPlayerId = ''
      room.turnStartedAt = 0
      room.records.push({
        round: room.round,
        winnerId: user.id,
        winnerName: user.name,
        color: user.color as GomokuColor,
        timestamp: Date.now(),
      })
      this.clearAllXiangqiDrafts(room)
      this.broadcast(roomId, 'gameResult', {
        winnerId: user.id,
        winnerName: user.name,
        round: room.round,
        color: user.color,
      })
    } else {
      room.currentPlayerId = room.currentPlayerId === room.blackUserId ? room.whiteUserId : room.blackUserId
      room.turnStartedAt = Date.now()
    }

    this.syncRoomStatus(roomId)
    return { success: true, draft: null }
  }

  private assignBlackWhite(room: GomokuRoom, forceRandomBlack = false, previousWinnerId = '') {
    if (room.users.length < 2) return

    const [firstUser, secondUser] = shuffleTwo(room.users)
    let blackUser = firstUser
    let whiteUser = secondUser

    if (!forceRandomBlack && room.blackSelectionMode === 'loser' && previousWinnerId) {
      const winnerUser = this.getUser(room, previousWinnerId)
      const loserUser = room.users.find((user) => user.id !== previousWinnerId)
      if (winnerUser && loserUser) {
        blackUser = loserUser
        whiteUser = winnerUser
      }
    }

    room.users.forEach((user) => {
      user.color = ''
    })
    blackUser.color = 'black'
    whiteUser.color = 'white'
    room.blackUserId = blackUser.id
    room.whiteUserId = whiteUser.id
  }

  private beginNextRound(room: GomokuRoom, forceRandomBlack = false, roomId?: string) {
    const previousWinnerId = room.winnerId
    room.currentGameMode = room.nextGameMode || 'gomoku'
    room.nextGameMode = room.currentGameMode
    room.xiangqiPieces = []
    this.clearAllXiangqiDrafts(room)
    
    if (room.currentGameMode === 'checkers') {
      // 跳棋模式
      room.checkersPlayerCount = Math.min(room.users.length, 4)
      const startZoneIndices = getCheckersStartZoneIndices(room.checkersPlayerCount)
      room.checkersPieces = initCheckersGame(room.checkersPlayerCount, startZoneIndices)
      this.clearAllCheckersDrafts(room)
      room.checkersTargetZones = {}
      
      // 为跳棋玩家分配颜色
      room.users.forEach((user, index) => {
        if (index < room.checkersPlayerCount) {
          const templatePlayerId = `player${index}`
          const startZoneIndex = startZoneIndices[index]
          room.checkersTargetZones[user.id] = getOppositeCheckersZoneIndex(startZoneIndex)
          const samplePiece = room.checkersPieces.find((piece) => piece.playerId === templatePlayerId)
          user.color = samplePiece?.color || ''
          room.checkersPieces.forEach((piece) => {
            if (piece.playerId === templatePlayerId) {
              piece.playerId = user.id
            }
          })
        } else {
          user.color = ''
        }
      })
      
      room.currentPlayerId = room.users[0]?.id || ''
      room.board = createBoard()
      if (roomId) {
        this.server.to(roomId).emit('checkersBoardPatch', {
          type: 'reset',
          pieces: room.checkersPieces,
        } as CheckersBoardPatch)
      }
    } else if (room.currentGameMode === 'xiangqi') {
      this.assignBlackWhite(room, forceRandomBlack, previousWinnerId)
      room.board = createBoard()
      room.checkersPieces = []
      this.clearAllCheckersDrafts(room)
      room.checkersTargetZones = {}
      room.xiangqiPieces = initXiangqiGame(room.blackUserId, room.whiteUserId)
      room.currentPlayerId = room.blackUserId
    } else if (room.currentGameMode === 'cs') {
      this.assignBlackWhite(room, forceRandomBlack, previousWinnerId)
      room.board = createBoard()
      room.checkersPieces = []
      this.clearAllCheckersDrafts(room)
      room.checkersTargetZones = {}
      room.xiangqiPieces = []
      this.clearAllXiangqiDrafts(room)
      room.currentPlayerId = room.blackUserId
    } else {
      // 五子棋模式
      this.assignBlackWhite(room, forceRandomBlack, previousWinnerId)
      room.board = createBoard()
      room.checkersPieces = []
      this.clearAllCheckersDrafts(room)
      room.checkersTargetZones = {}
      room.currentPlayerId = room.blackUserId
      if (roomId) {
        this.broadcastBoardPatch(roomId, { type: 'reset', board: cloneBoard(room.board) })
      }
    }
    
    room.moves = []
    room.winnerId = ''
    room.status = 'playing'
    room.round += 1
    room.turnStartedAt = Date.now()
    room.lastMoveDurations = {}
    this.resetReadyStatus(room)
  }

  private returnToWaiting(room: GomokuRoom, roomId?: string) {
    room.board = createBoard()
    room.moves = []
    room.winnerId = ''
    room.currentPlayerId = ''
    room.blackUserId = ''
    room.whiteUserId = ''
    room.status = 'waiting'
    room.turnStartedAt = 0
    room.lastMoveDurations = {}
    this.clearAllCheckersDrafts(room)
    room.xiangqiPieces = []
    this.clearAllXiangqiDrafts(room)
    room.checkersTargetZones = {}
    room.currentGameMode = room.nextGameMode || room.currentGameMode || 'gomoku'
    room.users.forEach((user) => {
      user.color = ''
    })
    this.resetReadyStatus(room)
    if (roomId) {
      this.broadcastBoardPatch(roomId, { type: 'reset', board: cloneBoard(room.board) })
    }
  }

  private restartRoom(room: GomokuRoom, roomId?: string) {
    room.board = createBoard()
    room.moves = []
    room.records = []
    room.round = 0
    room.winnerId = ''
    room.currentPlayerId = ''
    room.blackUserId = ''
    room.whiteUserId = ''
    room.status = 'waiting'
    room.turnStartedAt = 0
    room.lastMoveDurations = {}
    this.clearAllCheckersDrafts(room)
    room.xiangqiPieces = []
    this.clearAllXiangqiDrafts(room)
    room.checkersTargetZones = {}
    room.currentGameMode = 'gomoku'
    room.nextGameMode = 'gomoku'
    room.users.forEach((user) => {
      user.color = ''
    })
    this.resetReadyStatus(room)
    if (roomId) {
      this.broadcastBoardPatch(roomId, { type: 'reset', board: cloneBoard(room.board) })
    }
  }

  private getPayload(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return {
      id: room.id,
      status: room.status,
      users: room.users,
      hostId: room.hostId,
      blackSelectionMode: room.blackSelectionMode,
      currentGameMode: room.currentGameMode,
      nextGameMode: room.nextGameMode,
      round: room.round,
      currentPlayerId: room.currentPlayerId,
      blackUserId: room.blackUserId,
      whiteUserId: room.whiteUserId,
      blackUserName: this.getColorUser(room, 'black')?.name || '',
      whiteUserName: this.getColorUser(room, 'white')?.name || '',
      board: room.board,
      boardSize: BOARD_SIZE,
      moves: room.moves,
      winnerId: room.winnerId,
      winnerName: room.winnerId ? this.getUser(room, room.winnerId)?.name || '' : '',
      records: room.records,
      turnStartedAt: room.turnStartedAt,
      lastMoveDurations: room.lastMoveDurations,
      checkersPieces: room.checkersPieces,
      checkersPlayerCount: room.checkersPlayerCount,
      checkersDrafts: room.checkersDrafts,
      checkersTargetZones: room.checkersTargetZones,
      xiangqiPieces: room.xiangqiPieces,
      xiangqiDrafts: room.xiangqiDrafts,
    }
  }

  private broadcast(roomId: string, event: string, payload: any) {
    if (!this.server) return
    this.server.to(roomId).emit(event, payload)
  }

  private broadcastBoardPatch(roomId: string, patch: BoardPatch) {
    this.broadcast(roomId, 'boardPatch', patch)
  }

  syncRoomStatus(roomId: string) {
    const payload = this.getPayload(roomId)
    if (!payload) return
    this.broadcast(roomId, 'syncRoomStatus', payload)
  }

  @SubscribeMessage('updateGameMode')
  async updateGameMode(
    @MessageBody() data: { roomId: string; gameMode: GameMode },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const nextGameMode: GameMode =
      data.gameMode === 'xiangqi' || data.gameMode === 'checkers' || data.gameMode === 'cs'
        ? data.gameMode
        : 'gomoku'

    if (room.status === 'waiting') {
      room.currentGameMode = nextGameMode
      room.nextGameMode = nextGameMode
    } else if (room.status === 'settlement') {
      room.nextGameMode = nextGameMode
    } else {
      const response = { success: false, message: '当前回合进行中，无法切换游戏' }
      if (ack) ack(response)
      return response
    }

    this.syncRoomStatus(roomId)
    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @MessageBody() data: { roomId: string; userId: string },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const { roomId, userId } = data
    let room = this.rooms.get(roomId)
    if (!room) {
      room = createRoom(roomId, userId)
      this.rooms.set(roomId, room)
    }

    let user = this.getUser(room, userId)
    if (!user && room.users.length >= 4) {
      const response = { success: false, message: '房间已满' }
      if (ack) ack(response)
      else client.emit('joinRoom_response', response)
      client.disconnect(true)
      return response
    }

    if (!user) {
      user = {
        id: userId,
        name: `Gomoku_${Math.random().toString(36).slice(2, 8)}`,
        clientId: client.id,
        connectStatus: 'connected',
        color: '',
        readyStatus: null,
      }
      room.users.push(user)
      if (room.users.length === 1) {
        room.hostId = userId
      }
    } else {
      user.clientId = client.id
      user.connectStatus = 'connected'
    }

    this.socketToRoom.set(client.id, roomId)
    this.socketToUser.set(client.id, user)
    client.join(roomId)

    const response = { success: true }
    if (ack) ack(response)
    else client.emit('joinRoom_response', response)

    this.syncRoomStatus(roomId)
    return response
  }

  @SubscribeMessage('startGame')
  async startGame(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = this.rooms.get(roomId)
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const requester = this.socketToUser.get(client.id)
    if (!requester || requester.id !== room.hostId) {
      const response = { success: false, message: '只有房主可以开始游戏' }
      if (ack) ack(response)
      return response
    }

    if (room.users.length < 2) {
      const response = { success: false, message: '至少需要 2 名玩家' }
      if (ack) ack(response)
      return response
    }

    this.beginNextRound(room, true, roomId)

    this.syncRoomStatus(roomId)
    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('placeStone')
  async placeStone(
    @MessageBody() data: { x: number; y: number },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomIdSafe: string = roomId

    const room = this.rooms.get(roomIdSafe)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomSafe = room as GomokuRoom
    const userSafe = user as GomokuUser

    if (roomSafe.status !== 'playing') {
      const response = { success: false, message: '游戏尚未开始' }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.currentGameMode !== 'gomoku') {
      const response = { success: false, message: '当前不是五子棋模式' }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.currentPlayerId !== userSafe.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    const color = roomSafe.blackUserId === userSafe.id ? 'black' : roomSafe.whiteUserId === userSafe.id ? 'white' : ''
    if (!color) {
      const response = { success: false, message: '当前玩家未分配棋色' }
      if (ack) ack(response)
      return response
    }

    const { x, y } = data
    if (!isInsideBoard(x, y)) {
      const response = { success: false, message: '落子位置无效' }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.board[y][x]) {
      const response = { success: false, message: '这里已经有棋子了' }
      if (ack) ack(response)
      return response
    }

    roomSafe.board[y][x] = color
    roomSafe.moves.push({ x, y, userId: userSafe.id, color, timestamp: Date.now() })
    roomSafe.lastMoveDurations[userSafe.id] = Math.max(0, Date.now() - roomSafe.turnStartedAt)
    this.broadcastBoardPatch(roomIdSafe, { type: 'add', x, y, color })

    if (hasFiveInRow(roomSafe.board, x, y, color)) {
      roomSafe.winnerId = userSafe.id
      roomSafe.status = 'settlement'
      roomSafe.records.push({
        round: roomSafe.round,
        winnerId: userSafe.id,
        winnerName: userSafe.name,
        color,
        timestamp: Date.now(),
      })
      roomSafe.currentPlayerId = ''
      roomSafe.turnStartedAt = 0
      this.resetReadyStatus(roomSafe)
      this.broadcast(roomIdSafe, 'gameResult', {
        winnerId: userSafe.id,
        winnerName: userSafe.name,
        round: roomSafe.round,
        color,
      })
    } else {
      roomSafe.currentPlayerId = roomSafe.currentPlayerId === roomSafe.blackUserId ? roomSafe.whiteUserId : roomSafe.blackUserId
      roomSafe.turnStartedAt = Date.now()
    }

    this.syncRoomStatus(roomIdSafe)
    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('checkersClick')
  async checkersClick(
    @MessageBody() data: { q: number; r: number },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: CheckersDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomIdSafe: string = roomId

    const room = this.rooms.get(roomIdSafe)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomSafe = room as GomokuRoom
    const userSafe = user as GomokuUser

    if (roomSafe.status !== 'playing') {
      const response = { success: false, message: '游戏尚未开始' }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.currentGameMode !== 'checkers') {
      const response = { success: false, message: '当前不是跳棋模式' }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.currentPlayerId !== userSafe.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    const target: CheckersPosition = { q: data.q, r: data.r }
    if (!isInsideCheckersBoard(target)) {
      const response = {
        success: false,
        message: '落点无效',
        draft: roomSafe.checkersDrafts[userSafe.id] || null,
      }
      if (ack) ack(response)
      return response
    }

    const currentDraft = roomSafe.checkersDrafts[userSafe.id] || null
    const effectivePieces = getEffectivePiecesForDraft(roomSafe.checkersPieces, userSafe.id, currentDraft)
    const targetPiece = findPieceAt(effectivePieces, target)

    if (!currentDraft) {
      if (!targetPiece || targetPiece.playerId !== userSafe.id) {
        const response = { success: false, message: '请先点击自己的棋子', draft: null }
        if (ack) ack(response)
        return response
      }
      const draft: CheckersDraftState = {
        original: { q: target.q, r: target.r },
        current: { q: target.q, r: target.r },
        moveKind: 'none',
      }
      roomSafe.checkersDrafts[userSafe.id] = draft
      this.broadcastCheckersDraftState(roomIdSafe, userSafe.id, draft)
      const response = { success: true, draft }
      if (ack) ack(response)
      return response
    }

    // 已经发生位移后，不能切换棋子
    if (
      targetPiece &&
      targetPiece.playerId === userSafe.id &&
      !samePos(target, currentDraft.current)
    ) {
      if (currentDraft.moveKind !== 'none') {
        const response = { success: false, message: '已移动，不能切换棋子', draft: currentDraft }
        if (ack) ack(response)
        return response
      }
      const draft: CheckersDraftState = {
        original: { q: target.q, r: target.r },
        current: { q: target.q, r: target.r },
        moveKind: 'none',
      }
      roomSafe.checkersDrafts[userSafe.id] = draft
      this.broadcastCheckersDraftState(roomIdSafe, userSafe.id, draft)
      const response = { success: true, draft }
      if (ack) ack(response)
      return response
    }

    if (targetPiece) {
      const response = { success: false, message: '目标位置有棋子', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    if (currentDraft.moveKind === 'step') {
      const response = { success: false, message: '普通移动后不能继续移动', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    if (isAdjacentMove(currentDraft.current, target)) {
      if (currentDraft.moveKind === 'jump') {
        const response = { success: false, message: '跳跃后不能普通移动', draft: currentDraft }
        if (ack) ack(response)
        return response
      }
      const draft: CheckersDraftState = {
        original: currentDraft.original,
        current: target,
        moveKind: 'step',
      }
      roomSafe.checkersDrafts[userSafe.id] = draft
      this.broadcastCheckersDraftState(roomIdSafe, userSafe.id, draft)
      const response = { success: true, draft }
      if (ack) ack(response)
      return response
    }

    const reachable = getReachableJumpTargets(roomSafe.checkersPieces, userSafe.id, currentDraft)
    if (!reachable.has(posKey(target))) {
      const response = { success: false, message: '不能到达', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    const draft: CheckersDraftState = {
      original: currentDraft.original,
      current: target,
      moveKind: 'jump',
    }
    roomSafe.checkersDrafts[userSafe.id] = draft
    this.broadcastCheckersDraftState(roomIdSafe, userSafe.id, draft)
    const response = { success: true, draft }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('checkersConfirm')
  async checkersConfirm(
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: CheckersDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const room = this.rooms.get(roomId)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    if (room.status !== 'playing' || room.currentGameMode !== 'checkers') {
      const response = { success: false, message: '当前不是跳棋对局' }
      if (ack) ack(response)
      return response
    }

    if (room.currentPlayerId !== user.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    const draft = room.checkersDrafts[user.id] || null
    if (!draft || draft.moveKind === 'none') {
      const response = { success: false, message: '没有可确认的移动', draft }
      if (ack) ack(response)
      return response
    }

    const piece = room.checkersPieces.find(
      (p) => p.playerId === user.id && p.q === draft.original.q && p.r === draft.original.r,
    )
    if (!piece) {
      const response = { success: false, message: '原始棋子不存在', draft }
      if (ack) ack(response)
      return response
    }

    const targetOccupied = room.checkersPieces.some(
      (p) => p !== piece && p.q === draft.current.q && p.r === draft.current.r,
    )
    if (targetOccupied || !isInsideCheckersBoard(draft.current)) {
      const response = { success: false, message: '目标位置无效', draft }
      if (ack) ack(response)
      return response
    }

    const from = { ...draft.original }
    const to = { ...draft.current }
    piece.q = to.q
    piece.r = to.r
    room.lastMoveDurations[user.id] = Math.max(0, Date.now() - room.turnStartedAt)
    room.checkersDrafts[user.id] = null
    this.broadcastCheckersDraftState(roomId, user.id, null)

    this.server.to(roomId).emit('checkersBoardPatch', {
      type: 'move',
      from,
      to,
      playerId: user.id,
    } as CheckersBoardPatch)

    if (this.isCheckersPlayerWon(room, user.id)) {
      room.winnerId = user.id
      room.status = 'settlement'
      room.currentPlayerId = ''
      room.turnStartedAt = 0
      room.records.push({
        round: room.round,
        winnerId: user.id,
        winnerName: user.name,
        color: user.color as CheckersColor,
        timestamp: Date.now(),
      })
      this.clearAllCheckersDrafts(room)
      this.broadcast(roomId, 'gameResult', {
        winnerId: user.id,
        winnerName: user.name,
        round: room.round,
        color: user.color,
      })
    } else {
      this.rotateCheckersTurn(room, user.id)
      room.turnStartedAt = Date.now()
    }

    this.syncRoomStatus(roomId)
    const response = { success: true, draft: null }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('checkersCancel')
  async checkersCancel(
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: CheckersDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const room = this.rooms.get(roomId)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    room.checkersDrafts[user.id] = null
    this.broadcastCheckersDraftState(roomId, user.id, null)
    const response = { success: true, draft: null }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('xiangqiClick')
  async xiangqiClick(
    @MessageBody() data: { x: number; y: number },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: XiangqiDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const room = this.rooms.get(roomId)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    if (room.status !== 'playing' || room.currentGameMode !== 'xiangqi') {
      const response = { success: false, message: '当前不是象棋对局' }
      if (ack) ack(response)
      return response
    }

    if (room.currentPlayerId !== user.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    if (!isInsideXiangqiBoard(data.x, data.y)) {
      const response = { success: false, message: '落点无效', draft: room.xiangqiDrafts[user.id] || null }
      if (ack) ack(response)
      return response
    }

    const targetPiece = findXiangqiPieceAt(room.xiangqiPieces, data.x, data.y)
    const currentDraft = room.xiangqiDrafts[user.id] || null

    if (!currentDraft) {
      if (!targetPiece || targetPiece.playerId !== user.id) {
        const response = { success: false, message: '请先点击自己的棋子', draft: null }
        if (ack) ack(response)
        return response
      }
      const draft: XiangqiDraftState = {
        original: { x: data.x, y: data.y },
        current: { x: data.x, y: data.y },
        captured: null,
        moveKind: 'none',
      }
      room.xiangqiDrafts[user.id] = draft
      this.broadcastXiangqiDraftState(roomId, user.id, draft)
      const response = { success: true, draft }
      if (ack) ack(response)
      return response
    }

    if (currentDraft.moveKind !== 'none') {
      if (data.x === currentDraft.current.x && data.y === currentDraft.current.y) {
        const response = this.confirmXiangqiDraft(room, user, roomId)
        if (ack) ack(response)
        return response
      }
      const response = { success: false, message: '已选择落点，再次点击该落点可确认，或点取消', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    if (targetPiece && targetPiece.playerId === user.id) {
      const draft: XiangqiDraftState = {
        original: { x: data.x, y: data.y },
        current: { x: data.x, y: data.y },
        captured: null,
        moveKind: 'none',
      }
      room.xiangqiDrafts[user.id] = draft
      this.broadcastXiangqiDraftState(roomId, user.id, draft)
      const response = { success: true, draft }
      if (ack) ack(response)
      return response
    }

    const sourcePiece = findXiangqiPieceAt(room.xiangqiPieces, currentDraft.original.x, currentDraft.original.y)
    if (!sourcePiece || sourcePiece.playerId !== user.id) {
      const response = { success: false, message: '原始棋子不存在', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    const rule = canXiangqiPieceMove(room.xiangqiPieces, sourcePiece, data.x, data.y)
    if (!rule.ok) {
      const response = { success: false, message: rule.message || '不能移动到该位置', draft: currentDraft }
      if (ack) ack(response)
      return response
    }

    const draft: XiangqiDraftState = {
      original: { ...currentDraft.original },
      current: { x: data.x, y: data.y },
      captured: rule.captured ? { x: rule.captured.x, y: rule.captured.y } : null,
      moveKind: rule.captured ? 'capture' : 'move',
    }
    room.xiangqiDrafts[user.id] = draft
    this.broadcastXiangqiDraftState(roomId, user.id, draft)
    const response = { success: true, draft }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('xiangqiConfirm')
  async xiangqiConfirm(
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: XiangqiDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const room = this.rooms.get(roomId)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    if (room.status !== 'playing' || room.currentGameMode !== 'xiangqi') {
      const response = { success: false, message: '当前不是象棋对局' }
      if (ack) ack(response)
      return response
    }

    if (room.currentPlayerId !== user.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    const response = this.confirmXiangqiDraft(room, user, roomId)
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('xiangqiCancel')
  async xiangqiCancel(
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string; draft?: XiangqiDraftState | null }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const room = this.rooms.get(roomId)
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    room.xiangqiDrafts[user.id] = null
    this.broadcastXiangqiDraftState(roomId, user.id, null)
    const response = { success: true, draft: null }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('setUserStatus')
  async setUserStatus(
    @MessageBody() data: { userId: string; status: 'ready' | 'end' },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomIdSafe: string = roomId

    const room = this.rooms.get(roomIdSafe)
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomSafe = room as GomokuRoom

    const user = this.getUser(roomSafe, data.userId)
    if (!user) {
      const response = { success: false, message: 'User not found' }
      if (ack) ack(response)
      return response
    }

    if (data.status === 'end' && roomSafe.status === 'playing') {
      user.readyStatus = 'end'
      const winnerUser = roomSafe.users.find((member) => member.id !== user.id)
      if (winnerUser) {
        const winnerColor: GomokuColor = winnerUser.color === 'black' ? 'black' : 'white'
        roomSafe.winnerId = winnerUser.id
        roomSafe.status = 'settlement'
        roomSafe.currentPlayerId = ''
        roomSafe.turnStartedAt = 0
        roomSafe.records.push({
          round: roomSafe.round,
          winnerId: winnerUser.id,
          winnerName: winnerUser.name,
          color: winnerColor,
          timestamp: Date.now(),
        })
        this.broadcast(roomIdSafe, 'gameResult', {
          winnerId: winnerUser.id,
          winnerName: winnerUser.name,
          round: roomSafe.round,
          color: winnerColor,
        })
      }
      this.syncRoomStatus(roomIdSafe)
      const response = { success: true }
      if (ack) ack(response)
      return response
    }

    if (roomSafe.status !== 'settlement') {
      const response = { success: false, message: '当前不在结算阶段' }
      if (ack) ack(response)
      return response
    }

    user.readyStatus = data.status
    this.syncRoomStatus(roomIdSafe)

    const allReady = roomSafe.users.every((member) => member.readyStatus === 'ready')
    if (allReady && roomSafe.users.length >= 2) {
      this.beginNextRound(roomSafe, false, roomIdSafe)
      this.syncRoomStatus(roomIdSafe)
      const response = { success: true }
      if (ack) ack(response)
      return response
    }

    const allEnd = roomSafe.users.every((member) => member.readyStatus === 'end')
    if (allEnd) {
      this.returnToWaiting(roomSafe, roomIdSafe)
      this.syncRoomStatus(roomIdSafe)
    }

    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('restartGame')
  async restartGame(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const requester = this.socketToUser.get(client.id)
    if (!requester || requester.id !== room.hostId) {
      const response = { success: false, message: '只有房主可以重启房间' }
      if (ack) ack(response)
      return response
    }

    this.restartRoom(room, roomId)
    this.syncRoomStatus(roomId)

    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('updateGameSettings')
  async updateGameSettings(
    @MessageBody() data: { roomId: string; blackSelectionMode: BlackSelectionMode },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const requester = this.socketToUser.get(client.id)
    if (!requester || requester.id !== room.hostId) {
      const response = { success: false, message: '只有房主可以修改设置' }
      if (ack) ack(response)
      return response
    }

    room.blackSelectionMode = data.blackSelectionMode === 'random' ? 'random' : 'loser'
    this.syncRoomStatus(roomId)

    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  @SubscribeMessage('renameUser')
  async renameUser(
    @MessageBody() data: { userId: string; newName: string },
    @ConnectedSocket() client: Socket,
    ack?: (response: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const roomIdSafe: string = roomId

    const room = this.rooms.get(roomIdSafe)
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    const user = this.getUser(room, data.userId)
    if (!user) {
      const response = { success: false, message: 'User not found' }
      if (ack) ack(response)
      return response
    }

    const trimmedName = `${data.newName || ''}`.trim()
    if (trimmedName.length < 1 || trimmedName.length > 16) {
      const response = { success: false, message: '名称需要1-16字符' }
      if (ack) ack(response)
      return response
    }

    user.name = trimmedName
    this.syncRoomStatus(roomIdSafe)
    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  closeRoom(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) {
      return { success: false, message: 'Room not found' }
    }

    this.broadcast(roomId, 'roomClosed', { message: 'Room has been closed by admin' })
    this.rooms.delete(roomId)
    return { success: true, message: 'Room closed successfully' }
  }
}

@Controller('api/gomoku')
export class GomokuController {
  constructor(private gomokuGateway: GomokuGateway) {}

  @Get('rooms')
  @Roles(3)
  async getRooms() {
    const rooms = Array.from(this.gomokuGateway.rooms.entries()).map(([id, room]) => ({
      id,
      status: room.status,
      userCount: room.users.length,
      connectedCount: room.users.filter((user) => user.connectStatus === 'connected').length,
      hostId: room.hostId,
      round: room.round,
      winnerName: room.winnerId ? room.users.find((user) => user.id === room.winnerId)?.name || '' : '',
      recordsCount: room.records.length,
      users: room.users.map((user) => ({
        id: user.id,
        name: user.name,
        connectStatus: user.connectStatus,
      })),
    }))
    return { success: true, rooms }
  }

  @Post('rooms')
  @Roles(3)
  async createRoom() {
    const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
    this.gomokuGateway.rooms.set(roomId, createRoom(roomId, ''))
    return { success: true, roomId }
  }

  @Get('assign')
  @Public()
  async assignRoom() {
    for (const [id, room] of this.gomokuGateway.rooms.entries()) {
      if (room.status === 'waiting' && room.users.length < 2) {
        return { success: true, roomId: id }
      }
    }
    const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
    this.gomokuGateway.rooms.set(roomId, createRoom(roomId, ''))
    return { success: true, roomId }
  }

  @Get('occupied/:roomId/:userId')
  @Public()
  async checkOccupied(@Param('roomId') roomId: string, @Param('userId') userId: string) {
    const room = this.gomokuGateway.rooms.get(roomId)
    if (!room) {
      return { success: true, occupied: false }
    }
    const user = room.users.find((member) => member.id === userId)
    const occupied = !!user && user.connectStatus === 'connected'
    return { success: true, occupied }
  }

  @Delete('rooms/:roomId')
  @Roles(3)
  async closeRoom(@Param('roomId') roomId: string) {
    return this.gomokuGateway.closeRoom(roomId)
  }
}

@Module({
  controllers: [GomokuController],
  providers: [GomokuGateway],
  exports: [GomokuGateway],
})
export class GomokuModule {}
