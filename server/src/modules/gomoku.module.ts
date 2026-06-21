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

type GomokuColor = 'black' | 'white'

type ConnectStatus = 'connected' | 'disconnected'

type RoomStatus = 'waiting' | 'playing' | 'settlement'

interface GomokuUser {
  id: string
  name: string
  clientId: string
  connectStatus: ConnectStatus
  color: GomokuColor | ''
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
  color: GomokuColor
  timestamp: number
}

interface GomokuRoom {
  id: string
  status: RoomStatus
  users: GomokuUser[]
  hostId: string
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

function createRoom(roomId: string, hostId: string): GomokuRoom {
  return {
    id: roomId,
    status: 'waiting',
    users: [],
    hostId,
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
      user.connectStatus = 'disconnected'
      if (user.clientId === client.id) {
        user.clientId = ''
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

  private beginNextRound(room: GomokuRoom) {
    room.board = createBoard()
    room.moves = []
    room.winnerId = ''
    room.currentPlayerId = room.blackUserId
    room.status = 'playing'
    room.round += 1
    room.turnStartedAt = Date.now()
    room.lastMoveDurations = {}
    this.resetReadyStatus(room)
  }

  private returnToWaiting(room: GomokuRoom) {
    room.board = createBoard()
    room.moves = []
    room.winnerId = ''
    room.currentPlayerId = ''
    room.blackUserId = ''
    room.whiteUserId = ''
    room.status = 'waiting'
    room.turnStartedAt = 0
    room.lastMoveDurations = {}
    room.users.forEach((user) => {
      user.color = ''
    })
    this.resetReadyStatus(room)
  }

  private restartRoom(room: GomokuRoom) {
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
    room.users.forEach((user) => {
      user.color = ''
    })
    this.resetReadyStatus(room)
  }

  private getPayload(roomId: string) {
    const room = this.rooms.get(roomId)
    if (!room) return null
    return {
      id: room.id,
      status: room.status,
      users: room.users,
      hostId: room.hostId,
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
    }
  }

  private broadcast(roomId: string, event: string, payload: any) {
    this.server.to(roomId).emit(event, payload)
  }

  syncRoomStatus(roomId: string) {
    const payload = this.getPayload(roomId)
    if (!payload) return
    this.broadcast(roomId, 'syncRoomStatus', payload)
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
    if (!user && room.users.length >= 2) {
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

    const [blackUser, whiteUser] = shuffleTwo(room.users)
    room.users.forEach((user) => {
      user.color = ''
    })
    blackUser.color = 'black'
    whiteUser.color = 'white'
    room.blackUserId = blackUser.id
    room.whiteUserId = whiteUser.id
    this.beginNextRound(room)
    room.currentPlayerId = blackUser.id
    room.status = 'playing'

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
    const room = roomId ? this.rooms.get(roomId) : undefined
    const user = this.socketToUser.get(client.id)
    if (!room || !user) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    if (room.status !== 'playing') {
      const response = { success: false, message: '游戏尚未开始' }
      if (ack) ack(response)
      return response
    }

    if (room.currentPlayerId !== user.id) {
      const response = { success: false, message: '当前不是你的回合' }
      if (ack) ack(response)
      return response
    }

    const color = room.blackUserId === user.id ? 'black' : room.whiteUserId === user.id ? 'white' : ''
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

    if (room.board[y][x]) {
      const response = { success: false, message: '这里已经有棋子了' }
      if (ack) ack(response)
      return response
    }

    room.board[y][x] = color
    room.moves.push({ x, y, userId: user.id, color, timestamp: Date.now() })
    room.lastMoveDurations[user.id] = Math.max(0, Date.now() - room.turnStartedAt)

    if (hasFiveInRow(room.board, x, y, color)) {
      room.winnerId = user.id
      room.status = 'settlement'
      room.records.push({
        round: room.round,
        winnerId: user.id,
        winnerName: user.name,
        color,
        timestamp: Date.now(),
      })
      room.currentPlayerId = ''
      room.turnStartedAt = 0
      this.resetReadyStatus(room)
      this.broadcast(roomId, 'gameResult', {
        winnerId: user.id,
        winnerName: user.name,
        round: room.round,
        color,
      })
    } else {
      room.currentPlayerId = room.currentPlayerId === room.blackUserId ? room.whiteUserId : room.blackUserId
      room.turnStartedAt = Date.now()
    }

    this.syncRoomStatus(roomId)
    const response = { success: true }
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
    const room = roomId ? this.rooms.get(roomId) : undefined
    if (!room) {
      const response = { success: false, message: 'Room not found' }
      if (ack) ack(response)
      return response
    }

    if (room.status !== 'settlement') {
      const response = { success: false, message: '当前不在结算阶段' }
      if (ack) ack(response)
      return response
    }

    const user = this.getUser(room, data.userId)
    if (!user) {
      const response = { success: false, message: 'User not found' }
      if (ack) ack(response)
      return response
    }

    user.readyStatus = data.status
    this.syncRoomStatus(roomId)

    const allReady = room.users.every((member) => member.readyStatus === 'ready')
    if (allReady && room.users.length >= 2 && room.blackUserId && room.whiteUserId) {
      this.beginNextRound(room)
      this.syncRoomStatus(roomId)
      const response = { success: true }
      if (ack) ack(response)
      return response
    }

    const allEnd = room.users.every((member) => member.readyStatus === 'end')
    if (allEnd) {
      this.returnToWaiting(room)
      this.syncRoomStatus(roomId)
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

    this.restartRoom(room)
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
    const room = roomId ? this.rooms.get(roomId) : undefined
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
    this.syncRoomStatus(roomId)
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
