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
import { readFileSync } from 'fs'
import { join } from 'path'
import { Public, Roles } from 'src/guards/jwt-auth.guard'

// ===== 词库加载 =====
// 词库为 txt，每行第一个词是该行的类型，其余是容易画出来的具体词汇。
interface WordEntry {
  word: string
  category: string
}

function loadWordBank(): WordEntry[] {
  const candidates = [
    join(__dirname, 'drawguess.words.txt'),
    join(__dirname, '../../../../src/modules/drawguess.words.txt'),
    join(process.cwd(), 'src/modules/drawguess.words.txt'),
    join(process.cwd(), 'server/src/modules/drawguess.words.txt'),
  ]
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf-8')
      const entries: WordEntry[] = []
      raw.split(/\r?\n/).forEach((line) => {
        const tokens = line.trim().split(/\s+/).filter(Boolean)
        if (tokens.length < 2) return
        const category = tokens[0]
        for (let i = 1; i < tokens.length; i += 1) {
          entries.push({ word: tokens[i], category })
        }
      })
      if (entries.length) return entries
    } catch {
      // try next candidate
    }
  }
  // 兜底，避免词库缺失导致游戏不可用。
  return [
    { word: '猫', category: '动物' },
    { word: '苹果', category: '水果' },
    { word: '汽车', category: '交通工具' },
    { word: '太阳', category: '自然' },
    { word: '房子', category: '建筑' },
  ]
}

const WORD_BANK = loadWordBank()

// ===== 类型 =====
type RoomStatus = 'waiting' | 'playing' | 'settlement'
type RoundPhase = 'drawing' | 'roundEnd'
type ReadyStatus = 'ready' | 'end' | null

interface DrawUser {
  id: string
  name: string
  clientId: string
  connectStatus: 'connected' | 'disconnected'
  readyStatus: ReadyStatus
  score: number
}

interface StrokeChunk {
  color: string
  width: number
  // 归一化坐标 [x,y]，范围 0~1，客户端按画板尺寸还原。
  points: [number, number][]
}

interface RoundRecord {
  round: number
  drawerId: string
  drawerName: string
  word: string
  correctNames: string[]
  timestamp: number
}

interface DrawRoom {
  id: string
  status: RoomStatus
  users: DrawUser[]
  hostId: string
  round: number
  totalRounds: number
  roundSeconds: number
  drawerId: string
  phase: RoundPhase
  word: string
  category: string
  roundEndsAt: number
  // 本轮已按顺序猜对的玩家 id（用于计分名次）。
  correctUserIds: string[]
  // 本轮画的笔画（供中途加入者重放）。
  strokes: StrokeChunk[]
  records: RoundRecord[]
  drawOrder: string[]
  timer: NodeJS.Timeout | null
}

function createRoom(id: string, hostId: string): DrawRoom {
  return {
    id,
    status: 'waiting',
    users: [],
    hostId,
    round: 0,
    totalRounds: 6,
    roundSeconds: 90,
    drawerId: '',
    phase: 'drawing',
    word: '',
    category: '',
    roundEndsAt: 0,
    correctUserIds: [],
    strokes: [],
    records: [],
    drawOrder: [],
    timer: null,
  }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickWord(): WordEntry {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)]
}

@WebSocketGateway({ cors: true, namespace: 'drawguess' })
export class DrawGuessGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server

  rooms = new Map<string, DrawRoom>()
  private socketToRoom = new Map<string, string>()
  private socketToUser = new Map<string, DrawUser>()

  constructor() {
    this.server = {} as Server
  }

  handleConnection() {
    // join 时再登记映射。
  }

  handleDisconnect(client: Socket) {
    const roomId = this.socketToRoom.get(client.id)
    const user = this.socketToUser.get(client.id)
    if (user) user.connectStatus = 'disconnected'
    this.socketToRoom.delete(client.id)
    this.socketToUser.delete(client.id)
    if (roomId) this.syncRoomStatus(roomId)
  }

  // ===== 工具 =====
  private getUser(room: DrawRoom, userId: string) {
    return room.users.find((u) => u.id === userId)
  }

  private broadcast(roomId: string, event: string, payload: unknown) {
    this.server.to(roomId).emit(event, payload)
  }

  private emitToUser(room: DrawRoom, userId: string, event: string, payload: unknown) {
    const user = this.getUser(room, userId)
    if (user?.clientId) this.server.to(user.clientId).emit(event, payload)
  }

  // 供前端渲染的房间快照（不含正确词汇）。
  getPayload(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return null
    const topScore = room.users.reduce((max, u) => Math.max(max, u.score), 0)
    const winner =
      room.status === 'settlement'
        ? room.users.find((u) => u.score === topScore && topScore > 0)
        : undefined
    return {
      id: room.id,
      status: room.status,
      hostId: room.hostId,
      round: room.round,
      totalRounds: room.totalRounds,
      roundSeconds: room.roundSeconds,
      drawerId: room.drawerId,
      phase: room.phase,
      roundEndsAt: room.roundEndsAt,
      category: room.status === 'playing' ? room.category : '',
      wordLength: room.status === 'playing' ? room.word.length : 0,
      // roundEnd 阶段公开答案。
      revealWord: room.phase === 'roundEnd' && room.status === 'playing' ? room.word : '',
      correctUserIds: room.correctUserIds,
      winnerName: winner ? winner.name : '',
      users: room.users.map((u) => ({
        id: u.id,
        name: u.name,
        connectStatus: u.connectStatus,
        readyStatus: u.readyStatus,
        score: u.score,
      })),
      records: room.records,
    }
  }

  syncRoomStatus(roomId: string) {
    const payload = this.getPayload(roomId)
    if (payload) this.broadcast(roomId, 'syncRoomStatus', payload)
  }

  private clearTimer(room: DrawRoom) {
    if (room.timer) {
      clearTimeout(room.timer)
      room.timer = null
    }
  }

  // ===== 回合流程 =====
  private beginRound(room: DrawRoom) {
    this.clearTimer(room)
    room.drawerId = room.drawOrder[room.round % room.drawOrder.length]
    const entry = pickWord()
    room.word = entry.word
    room.category = entry.category
    room.phase = 'drawing'
    room.strokes = []
    room.correctUserIds = []
    room.roundEndsAt = Date.now() + room.roundSeconds * 1000

    // 只把答案发给画的人。
    this.emitToUser(room, room.drawerId, 'drawerWord', { word: room.word, category: room.category })
    this.broadcast(room.id, 'clearCanvas', {})
    this.syncRoomStatus(room.id)

    room.timer = setTimeout(() => this.endRound(room.id), room.roundSeconds * 1000)
  }

  private endRound(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing' || room.phase !== 'drawing') return
    this.clearTimer(room)
    room.phase = 'roundEnd'

    const correctNames = room.correctUserIds
      .map((id) => this.getUser(room, id)?.name || '')
      .filter(Boolean)
    room.records.push({
      round: room.round + 1,
      drawerId: room.drawerId,
      drawerName: this.getUser(room, room.drawerId)?.name || '',
      word: room.word,
      correctNames,
      timestamp: Date.now(),
    })

    this.broadcast(room.id, 'roundResult', {
      word: room.word,
      drawerName: this.getUser(room, room.drawerId)?.name || '',
      correctNames,
    })
    this.syncRoomStatus(room.id)

    // 稍作停留后进入下一轮或结算。
    room.timer = setTimeout(() => this.advanceRound(room.id), 4000)
  }

  private advanceRound(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing') return
    this.clearTimer(room)
    room.round += 1
    if (room.round >= room.totalRounds) {
      room.status = 'settlement'
      room.phase = 'roundEnd'
      room.drawerId = ''
      room.users.forEach((u) => (u.readyStatus = null))
      this.syncRoomStatus(room.id)
      return
    }
    this.beginRound(room)
  }

  private startNewGame(room: DrawRoom) {
    this.clearTimer(room)
    room.users.forEach((u) => {
      u.score = 0
      u.readyStatus = null
    })
    room.records = []
    room.round = 0
    room.status = 'playing'
    room.drawOrder = shuffle(room.users.map((u) => u.id))
    this.beginRound(room)
  }

  private returnToWaiting(room: DrawRoom) {
    this.clearTimer(room)
    room.status = 'waiting'
    room.phase = 'drawing'
    room.drawerId = ''
    room.word = ''
    room.category = ''
    room.strokes = []
    room.correctUserIds = []
    room.roundEndsAt = 0
    room.round = 0
    room.users.forEach((u) => {
      u.readyStatus = null
      u.score = 0
    })
  }

  // ===== 事件 =====
  @SubscribeMessage('joinRoom')
  onJoin(
    @MessageBody() data: { roomId: string; userId: string },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const { roomId, userId } = data
    const room = this.rooms.get(roomId)
    if (!room) return
    let user = this.getUser(room, userId)
    if (!user && room.users.length >= 8) {
      const response = { success: false, message: '房间已满' }
      if (ack) ack(response)
      else client.emit('joinRoom_response', response)
      client.disconnect(true)
      return response
    }
    if (!user) {
      user = {
        id: userId,
        name: `玩家_${Math.random().toString(36).slice(2, 6)}`,
        clientId: client.id,
        connectStatus: 'connected',
        readyStatus: null,
        score: 0,
      }
      room.users.push(user)
      if (room.users.length === 1) room.hostId = userId
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

    // 中途加入者需要补发当前画面与（若是画家）答案。
    if (room.status === 'playing' && room.phase === 'drawing') {
      client.emit('syncStrokes', { strokes: room.strokes })
      if (room.drawerId === userId) {
        client.emit('drawerWord', { word: room.word, category: room.category })
      }
    }
    this.syncRoomStatus(roomId)
    return response
  }

  @SubscribeMessage('startGame')
  onStart(
    @MessageBody() data: { roomId: string; userId?: string },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = this.rooms.get(roomId)
    if (!room) return this.fail(ack, 'Room not found')
    const requester =
      this.socketToUser.get(client.id) ||
      (data.userId ? this.getUser(room, data.userId) : undefined)
    if (!requester || requester.id !== room.hostId) {
      return this.fail(ack, '只有房主可以开始游戏')
    }
    if (room.users.length < 2) return this.fail(ack, '至少需要 2 名玩家')
    // 每位玩家至少画一次。
    room.totalRounds = Math.max(room.totalRounds, room.users.length)
    this.startNewGame(room)
    return this.ok(ack)
  }

  @SubscribeMessage('guess')
  onGuess(
    @MessageBody() data: { text: string },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; correct?: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    const user = this.socketToUser.get(client.id)
    if (!roomId || !user) return this.fail(ack, 'Room not found')
    const room = this.rooms.get(roomId)
    if (!room || room.status !== 'playing' || room.phase !== 'drawing') {
      return this.fail(ack, '现在不能猜')
    }
    if (room.drawerId === user.id) return this.fail(ack, '画的人不能猜')
    if (room.correctUserIds.includes(user.id)) return this.fail(ack, '你已经猜对了')

    const guess = `${data?.text || ''}`.trim()
    if (!guess) return this.fail(ack, '请输入词汇')

    if (guess === room.word) {
      const order = room.correctUserIds.length // 0=第一个
      const gained = order === 0 ? 3 : order === 1 ? 2 : 1
      room.correctUserIds.push(user.id)
      user.score += gained
      // 每有一人猜对，画的人 +1。
      const drawer = this.getUser(room, room.drawerId)
      if (drawer) drawer.score += 1

      // 只公布"猜对了"，不显示所猜词。
      this.broadcast(roomId, 'guessMessage', {
        userId: user.id,
        name: user.name,
        correct: true,
        text: '',
      })
      if (ack) ack({ success: true, correct: true })

      // 所有非画家都猜对则提前结束本轮。
      const guessers = room.users.filter((u) => u.id !== room.drawerId)
      if (guessers.length > 0 && guessers.every((u) => room.correctUserIds.includes(u.id))) {
        this.endRound(roomId)
      } else {
        this.syncRoomStatus(roomId)
      }
      return { success: true, correct: true }
    }

    // 猜错：作为聊天广播（显示所猜词）。
    this.broadcast(roomId, 'guessMessage', {
      userId: user.id,
      name: user.name,
      correct: false,
      text: guess.slice(0, 40),
    })
    if (ack) ack({ success: true, correct: false })
    return { success: true, correct: false }
  }

  @SubscribeMessage('setUserStatus')
  onSetStatus(
    @MessageBody() data: { userId: string; status: 'ready' | 'end' },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) return this.fail(ack, 'Room not found')
    const room = this.rooms.get(roomId)
    if (!room) return this.fail(ack, 'Room not found')
    const user = this.getUser(room, data.userId)
    if (!user) return this.fail(ack, 'User not found')
    if (room.status !== 'settlement') return this.fail(ack, '当前不在结算阶段')

    user.readyStatus = data.status
    this.syncRoomStatus(roomId)

    const allReady = room.users.every((u) => u.readyStatus === 'ready')
    if (allReady && room.users.length >= 2) {
      this.startNewGame(room)
      return this.ok(ack)
    }
    const allEnd = room.users.every((u) => u.readyStatus === 'end')
    if (allEnd) {
      this.returnToWaiting(room)
      this.syncRoomStatus(roomId)
    }
    return this.ok(ack)
  }

  @SubscribeMessage('restartGame')
  onRestart(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) return this.fail(ack, 'Room not found')
    const requester = this.socketToUser.get(client.id)
    if (!requester || requester.id !== room.hostId) {
      return this.fail(ack, '只有房主可以重启房间')
    }
    this.returnToWaiting(room)
    this.syncRoomStatus(roomId)
    return this.ok(ack)
  }

  @SubscribeMessage('renameUser')
  onRename(
    @MessageBody() data: { userId: string; newName: string },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id)
    if (!roomId) return this.fail(ack, 'Room not found')
    const room = this.rooms.get(roomId)
    if (!room) return this.fail(ack, 'Room not found')
    const user = this.getUser(room, data.userId)
    if (!user) return this.fail(ack, 'User not found')
    const trimmed = `${data.newName || ''}`.trim()
    if (trimmed.length < 1 || trimmed.length > 16) {
      return this.fail(ack, '名称需要1-16字符')
    }
    user.name = trimmed
    this.syncRoomStatus(roomId)
    return this.ok(ack)
  }

  @SubscribeMessage('updateGameSettings')
  onUpdateSettings(
    @MessageBody() data: { roomId: string; totalRounds?: number; roundSeconds?: number },
    @ConnectedSocket() client: Socket,
    ack?: (r: { success: boolean; message?: string }) => void,
  ) {
    const roomId = this.socketToRoom.get(client.id) || data.roomId
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) return this.fail(ack, 'Room not found')
    const requester = this.socketToUser.get(client.id)
    if (!requester || requester.id !== room.hostId) {
      return this.fail(ack, '只有房主可以修改设置')
    }
    if (room.status === 'playing') return this.fail(ack, '游戏进行中无法修改设置')
    if (Number.isFinite(data.totalRounds)) {
      room.totalRounds = Math.min(30, Math.max(2, Math.floor(data.totalRounds as number)))
    }
    if (Number.isFinite(data.roundSeconds)) {
      room.roundSeconds = Math.min(300, Math.max(20, Math.floor(data.roundSeconds as number)))
    }
    this.syncRoomStatus(roomId)
    return this.ok(ack)
  }

  closeRoom(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return { success: false, message: 'Room not found' }
    this.clearTimer(room)
    this.broadcast(roomId, 'roomClosed', { message: 'Room has been closed by admin' })
    this.rooms.delete(roomId)
    return { success: true, message: 'Room closed successfully' }
  }

  private ok(ack?: (r: { success: boolean; message?: string }) => void) {
    const response = { success: true }
    if (ack) ack(response)
    return response
  }

  private fail(
    ack: ((r: { success: boolean; message?: string }) => void) | undefined,
    message: string,
  ) {
    const response = { success: false, message }
    if (ack) ack(response)
    return response
  }
}

@Controller('api/drawguess')
export class DrawGuessController {
  constructor(private gateway: DrawGuessGateway) {}

  @Get('rooms')
  @Roles(3)
  async getRooms() {
    const rooms = Array.from(this.gateway.rooms.entries()).map(([id, room]) => ({
      id,
      status: room.status,
      userCount: room.users.length,
      connectedCount: room.users.filter((u) => u.connectStatus === 'connected').length,
      hostId: room.hostId,
      round: room.round,
      winnerName: '',
      recordsCount: room.records.length,
      users: room.users.map((u) => ({
        id: u.id,
        name: u.name,
        connectStatus: u.connectStatus,
      })),
    }))
    return { success: true, rooms }
  }

  @Post('rooms')
  @Roles(3)
  async createRoom() {
    const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
    this.gateway.rooms.set(roomId, createRoom(roomId, ''))
    return { success: true, roomId }
  }

  @Get('assign')
  @Public()
  async assignRoom() {
    for (const [id, room] of this.gateway.rooms.entries()) {
      if (room.status === 'waiting' && room.users.length < 8) {
        return { success: true, roomId: id }
      }
    }
    const roomId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
    this.gateway.rooms.set(roomId, createRoom(roomId, ''))
    return { success: true, roomId }
  }

  @Get('occupied/:roomId/:userId')
  @Public()
  async checkOccupied(@Param('roomId') roomId: string, @Param('userId') userId: string) {
    const room = this.gateway.rooms.get(roomId)
    if (!room) return { success: true, occupied: false }
    const user = room.users.find((member) => member.id === userId)
    const occupied = !!user && user.connectStatus === 'connected'
    return { success: true, occupied }
  }

  @Delete('rooms/:roomId')
  @Roles(3)
  async closeRoom(@Param('roomId') roomId: string) {
    return this.gateway.closeRoom(roomId)
  }
}

@Module({
  controllers: [DrawGuessController],
  providers: [DrawGuessGateway],
  exports: [DrawGuessGateway],
})
export class DrawGuessModule {}
