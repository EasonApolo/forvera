import {
  ArgumentsHost,
  Catch,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Post,
  UseFilters,
  WsExceptionFilter,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Public, Roles } from 'src/guards/jwt-auth.guard';
import {
  ChatInstruction,
  ChatMessage,
  GameDTO,
  IGameRoom,
  IGameUser,
  RoundResult,
  ReadyStatus,
  RoomStatus,
  RoundStatus,
  TurnStatus,
  WsCustomMsg,
} from 'shared/types/game';
import { shuffle } from 'shared/utils';
import DrawGuess from './games/drawguess';

const GAME_MAP: Record<string, any> = {
  drawguess: DrawGuess,
};

export interface GameHookParams {
  room: GameRoom;
}

export type GameHookReturn = {
  duration?: number;
  skip?: boolean;
} | void;

export interface Game {
  onUserJoin?: ({ room, user }: { room: GameRoom; user: GameUser }) => void;
  onInitGame?: (params: GameHookParams) => void;
  onStartGame?: (params: GameHookParams) => void;
  onBeforeRoundStart?: (params: GameHookParams) => GameHookReturn;
  onAfterRoundStart?: (params: GameHookParams) => GameHookReturn;
  onBeforeTurnStart?: (params: GameHookParams) => GameHookReturn;
  onIngTurnStart?: (params: GameHookParams) => GameHookReturn;
  onAfterTurnStart?: (params: GameHookParams) => GameHookReturn;
  onAfterTurnEnd?: (params: GameHookParams) => void;
  onMsg?: ({
    type,
    room,
    user,
    data,
  }: {
    type: string;
    room: GameRoom;
    user: GameUser;
    data: any;
  }) => void;
  onMessageBefore?: ({
    room,
    user,
    text,
  }: {
    room: GameRoom;
    user: GameUser;
    text: string;
  }) => ChatInstruction | undefined;
}

export type Visibility = 'public' | 'private' | string[];
export type PropertyDescriptor = { visibility: Visibility; isDirty: boolean };
export class AutoSyncData {
  _rawValues: Record<string, any> = {};
  _rawMeta: Record<string, { visibility: Visibility; dirty: boolean }> = {};

  register(prop: string, visibility: Visibility) {
    this._rawMeta[prop] = { visibility, dirty: true };

    if (Reflect.has(this, prop)) {
      this._rawValues[prop] = (this as any)[prop];
    }

    Object.defineProperty(this, prop, {
      configurable: true,
      enumerable: true,

      get: () => {
        return this._rawValues[prop];
      },

      set: (newValue: any) => {
        const oldValue = this._rawValues[prop];

        if (oldValue !== newValue) {
          this._rawValues[prop] = newValue;
          this._rawMeta[prop].dirty = true;
        }
      },
    });
  }

  setDirty(prop: string) {
    if (this._rawMeta[prop]) {
      this._rawMeta[prop].dirty = true;
    }
  }

  setVisibility(prop: string, visibility: Visibility) {
    if (this._rawMeta[prop]) {
      this._rawMeta[prop].visibility = visibility;
      this._rawMeta[prop].dirty = true;
    }
  }

  collectData({
    targetUserId,
    fromUserId,
    onlyDirty = true,
  }: {
    targetUserId: string;
    fromUserId?: string;
    onlyDirty?: boolean;
  }) {
    const data: Record<string, any> = {};
    let hasDirty = false;
    Object.entries(this._rawMeta).forEach(([prop, desc]) => {
      if (onlyDirty && !desc.dirty) {
        return;
      }
      hasDirty = true;
      if (desc.visibility === 'public') {
        data[prop] = this._rawValues[prop];
      } else if (desc.visibility === 'private') {
        if (fromUserId && fromUserId === targetUserId) {
          data[prop] = this._rawValues[prop];
        } else if (hasDirty) {
          // 如果是想要hide这个属性，默认返回null用于清除。
          data[prop] = null;
        }
      } else if (Array.isArray(desc.visibility)) {
        if (desc.visibility.includes(targetUserId)) {
          data[prop] = this._rawValues[prop];
        } else if (hasDirty) {
          // 如果是想要hide这个属性，默认返回null用于清除。
          data[prop] = null;
        }
      }
    });
    return hasDirty ? data : null;
  }

  clearDirtyMarks() {
    Object.values(this._rawMeta).forEach((desc) => {
      desc.dirty = false;
    });
  }
}

export class GameUser extends AutoSyncData implements IGameUser {
  id: string;
  name: string;
  clientId: string;
  connectStatus: 'connected' | 'disconnected';
  readyStatus: ReadyStatus;

  ackedSeq: number;
  seq: number;

  [key: string]: any; // 允许附加自定义字段

  constructor(userId: string, clientId: string) {
    super();
    this.register('id', 'public');
    this.register('name', 'public');
    this.register('connectStatus', 'public');
    this.register('readyStatus', 'public');
    this.id = userId;
    this.name = `玩家_${Math.random().toString(36).slice(2, 6)}`;
    this.clientId = clientId;
    this.connectStatus = 'connected';
    this.readyStatus = null;
    this.ackedSeq = 0;
    this.seq = 0;
  }
}

export class GameRoom extends AutoSyncData implements IGameRoom {
  id!: string;
  status: RoomStatus;
  hostId: string;

  users: { [userId: string]: GameUser };
  userOrder: string[];

  gameKey: string;
  game: Game | null;

  turn: number; // 回合
  turnStatus: TurnStatus;

  round: number; // 局
  roundStatus: RoundStatus;

  roundResults: RoundResult[];

  startTime: number;
  duration: number;
  timer: NodeJS.Timeout | null;
  gateway: GameGateway;

  [key: string]: any; // 允许附加自定义字段

  constructor(gateway: GameGateway) {
    super();
    this.register('id', 'public');
    this.register('status', 'public');
    this.register('hostId', 'public');
    this.register('users', 'public');
    this.register('userOrder', 'public');
    this.register('turn', 'public');
    this.register('turnStatus', 'public');
    this.register('round', 'public');
    this.register('roundStatus', 'public');
    this.register('roundResults', 'public');
    this.register('startTime', 'public');
    this.register('duration', 'public');

    const roomId =
      Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

    this.id = roomId;
    this.status = 'waiting';
    this.hostId = '';

    this.users = {};
    this.userOrder = [];

    this.gameKey = 'drawguess';
    this.game = null;

    this.turn = 0; // 回合
    this.turnStatus = 'before';
    this.turnSeconds = 75;

    this.round = 0; // 局
    this.roundStatus = 'before';
    this.roundSeconds = 75;

    // 对局记录列表。
    this.roundResults = [];

    this.startTime = 0;
    this.duration = 0;
    this.timer = null;
    this.gateway = gateway;
  }

  collectSyncData(userId: string, onlyDirty = true) {
    const roomDirtyData = this.collectData({ targetUserId: userId, onlyDirty });
    let dirtyUserDataEntries: [string, any][] = [];
    Object.entries(this.users).forEach(([fromUserId, user]) => {
      const userDirtyData = user.collectData({
        targetUserId: userId,
        fromUserId,
        onlyDirty,
      });
      if (!userDirtyData) return;
      dirtyUserDataEntries.push([fromUserId, userDirtyData]);
    });
    const usersDirtyData =
      dirtyUserDataEntries.length > 0
        ? Object.fromEntries(dirtyUserDataEntries)
        : null;
    if (!roomDirtyData && !usersDirtyData) {
      return null;
    }
    if (!roomDirtyData) {
      return { users: usersDirtyData };
    }
    if (!usersDirtyData) {
      return roomDirtyData;
    }
    return { ...roomDirtyData, users: usersDirtyData };
  }

  sync({ syncAll }: { syncAll?: string[] } = {}) {
    for (const [userId, user] of Object.entries(this.users)) {
      let thisUserSyncAll =
        syncAll && syncAll.length > 0 && syncAll.includes(userId);
      const data = this.collectSyncData(userId, !thisUserSyncAll);
      if (data) {
        this.emitToUser({
          user: user,
          event: 'syncRoom',
          data,
        });
      }
    }
    this.clearDirtyMarks();
    Object.values(this.users).forEach((u) => u.clearDirtyMarks());
  }

  emitToSomeAndOthers({
    someUserIds,
    someData,
    event,
    data,
  }: {
    someUserIds: string[];
    someData: any;
    event: string;
    data?: any;
  }) {
    for (const userId of this.userOrder) {
      const user = this.users[userId];
      if (someUserIds.includes(user.id)) {
        this.emitToUser({ user, event, data: someData });
      } else {
        this.emitToUser({ user, event, data });
      }
    }
  }

  emitToAllExcept({
    userId,
    event,
    data,
  }: {
    userId: string;
    event: string;
    data?: any;
  }) {
    for (const userIdKey of this.userOrder) {
      const user = this.users[userIdKey];
      if (user.id !== userId) {
        this.emitToUser({ user, event, data });
      }
    }
  }

  emitToAll({ event, data }: { event: string; data?: any }) {
    for (const userId of this.userOrder) {
      const user = this.users[userId];
      this.emitToUser({ user, event, data });
    }
  }

  emitToUser({
    user,
    userId,
    event,
    data,
  }: {
    user?: GameUser;
    userId?: string;
    event: string;
    data?: any;
  }) {
    user = user || this.users[userId!];
    if (!user || !user.clientId || user.connectStatus !== 'connected') return;
    user.seq = (user.seq || 0) + 1;
    this.gateway.emitToUser({
      clientId: user.clientId,
      event,
      payload: { seq: user.seq, t: Date.now(), data },
    });
  }

  addUser({
    userId,
    clientId,
  }: {
    userId: string;
    clientId: string;
  }): GameUser {
    const newUser = new GameUser(userId, clientId);
    this.userOrder.push(newUser.id);
    this.setDirty('userOrder');
    this.users[newUser.id] = newUser;
    this.game?.onUserJoin?.({ room: this, user: newUser });
    if (this.userOrder.length === 1) this.hostId = userId;
    return newUser;
  }

  userConnect({ userId, clientId }: { userId: string; clientId: string }) {
    const user = this.users[userId];
    if (!user) {
      // not exist, add new user
      this.addUser({ userId, clientId });
    } else {
      // exist, reconnect
      user.clientId = clientId;
      user.connectStatus = 'connected';
    }
    this.sync({ syncAll: [userId] });
  }

  userDisconnect({ userId }: { userId: string }) {
    const user = this.users[userId];
    if (!user) return;
    user.connectStatus = 'disconnected';
  }

  shuffleUsers() {
    this.userOrder = shuffle(this.userOrder);
  }

  isGamePlaying() {
    return this.status === 'playing';
  }

  isHost(userId: string) {
    return this.hostId === userId;
  }

  getNextUser({
    connected = true,
    current,
  }: {
    connected?: boolean;
    current?: string;
  }) {
    let currentIndex = current
      ? this.userOrder.findIndex((id) => id === current)
      : -1;
    let i = 0;
    while (i < this.userOrder.length) {
      const nextIndex = (currentIndex + 1) % this.userOrder.length;
      const nextUser = this.users[this.userOrder[nextIndex]];
      if (connected && nextUser.connectStatus !== 'connected') {
        currentIndex = nextIndex;
        i += 1;
        continue;
      }
      return nextUser;
    }
    return null
  }

  setTimer(callback: () => void, duration: number) {
    this.clearTimer();
    this.timer = setTimeout(callback, duration);
    this.startTime = Date.now();
    this.duration = duration;
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.startTime = 0;
      this.duration = 0;
    }
  }

  startGame() {
    if (this.userOrder.length < 2) throw new Error('至少需要 2 名玩家');
    this.gotoIngGame();
  }

  gotoBeforeGame() {
    this.clearTimer();
    // reset the game
    this.status = 'waiting';
    this.turn = 0;
    this.round = 0;
    this.roundResults = [];
    this.sync();
  }

  gotoIngGame() {
    this.clearTimer();
    this.status = 'playing';
    this.game = new GAME_MAP[this.gameKey]();
    this.game?.onStartGame?.({ room: this });
    this.gotoBeforeRound();
  }

  gotoAfterGame() {
    this.clearTimer();
    this.status = 'settlement';
  }

  gotoBeforeRound() {
    this.roundStatus = 'before';
    this.round += 1;
    this.turnStatus = 'before';
    this.turn = 0;
    const { duration, skip = true } =
      this.game?.onBeforeRoundStart?.({ room: this }) || {};
    if (skip) {
      this.gotoIngRound();
      return;
    }
    this.sync();
    if (duration) {
      setTimeout(() => {
        this.gotoIngRound();
      }, duration);
    }
  }

  gotoIngRound() {
    this.roundStatus = 'ing';
    this.gotoBeforeTurn();
  }

  gotoAfterRound() {
    this.roundStatus = 'after';
    this.game?.onAfterRoundStart?.({ room: this });
    this.sync();
  }

  gotoBeforeTurn() {
    this.turnStatus = 'before';
    this.turn += 1;
    const { duration, skip = true } =
      this.game?.onBeforeTurnStart?.({ room: this }) || {};
    if (skip) {
      this.gotoIngTurn();
      return;
    }
    this.sync();
    if (duration) {
      setTimeout(() => {
        this.gotoIngTurn();
      }, duration);
    }
  }

  gotoIngTurn() {
    this.turnStatus = 'ing';
    const { duration, skip = false } =
      this.game?.onIngTurnStart?.({ room: this }) || {};
    if (skip) {
      this.gotoAfterTurn();
      return;
    }
    if (duration) {
      this.setTimer(() => {
        this.startTime = Date.now();
        this.duration = duration;
        this.gotoAfterTurn();
      }, duration);
    }
    this.sync();
  }

  gotoAfterTurn() {
    this.clearTimer();
    this.turnStatus = 'after';
    const { duration, skip } =
      this.game?.onAfterTurnStart?.({ room: this }) || {};
    if (skip) {
      this.finishAfterTurn();
      return;
    }
    if (duration) {
      this.setTimer(() => {
        this.game?.onAfterTurnEnd?.({ room: this });
      }, duration);
    }
    this.sync();
  }

  setRoundResult({ users }: { users: RoundResult['users'] }) {
    const roundResult: RoundResult = {
      round: this.round,
      users,
    };
    this.roundResults = [...this.roundResults, roundResult];
  }

  setUserStatus({ userId, status }: { userId: string; status: ReadyStatus }) {
    const user = this.users[userId];
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.readyStatus = status;

    // 检测是否全部准备好或全部结束
    const allReady = Object.values(this.users).every(
      (u) => u.readyStatus === 'ready',
    );
    const allEnd = Object.values(this.users).every(
      (u) => u.readyStatus === 'end',
    );
    if (allReady) {
      this.gotoBeforeRound();
    } else if (allEnd) {
      this.gotoAfterGame();
    }
    if (allReady || allEnd) {
      Object.values(this.users).forEach((u) => {
        if (u.readyStatus === 'ready') {
          u.readyStatus = null;
        }
      });
    }

    this.sync();
  }
}

type Ack = (r: {
  success: boolean;
  message?: string;
  correct?: boolean;
}) => void;

@Catch() // Catches all unhandled exceptions (WsException, Error, etc.)
export class GlobalWsExceptionFilter implements WsExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    console.error(
      '\n---------------------------\n\nGlobalWsExceptionFilter caught an exception:',
      exception,
    );

    const client = host.switchToWs().getClient<Socket>();

    // Extract the acknowledgment callback if the frontend sent one
    const args = host.getArgs();
    const ack =
      typeof args[args.length - 1] === 'function'
        ? args[args.length - 1]
        : null;

    // Extract message from WsException or generic Error
    const errorMessage =
      exception instanceof WsException
        ? exception.getError()
        : exception.message || 'Internal server error';

    const response = {
      success: false,
      error: errorMessage,
    };

    // 1. If the client sent an `ack` callback, respond directly via ack
    if (ack) {
      ack(response);
      return;
    }

    // 2. Otherwise, emit a global 'exception' event to the client
    client.emit('exception', response);
  }
}

@UseFilters(new GlobalWsExceptionFilter())
@WebSocketGateway({ cors: true, namespace: 'game' })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  rooms = new Map<string, GameRoom>();
  private socketToRoom = new Map<string, string>();
  private socketToUser = new Map<string, string>();

  constructor() {
    this.server = {} as Server;
  }

  // ===== 连接生命周期 =====
  handleConnection(client: Socket) {}

  handleDisconnect(client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const userId = this.socketToUser.get(client.id);
    if (room && userId) {
      room.userDisconnect({ userId });
    }
    this.socketToRoom.delete(client.id);
    this.socketToUser.delete(client.id);
  }

  getRoomAndUser(client: Socket, ack?: Ack) {
    const roomId = this.socketToRoom.get(client.id);
    const userId = this.socketToUser.get(client.id);
    if (!roomId || !userId) {
      throw new Error('Room or user not found');
    }
    const room = this.rooms.get(roomId);
    const user = room?.users[userId];
    if (!room || !user) {
      throw new Error('Room or user not found');
    }
    return { roomId, userId, user, room };
  }

  emitToAll(room: GameRoom, event: string, payload: any) {
    this.server.to(room.id).emit(event, payload);
  }

  emitToUser({
    clientId,
    event,
    payload,
  }: {
    clientId: string;
    event: string;
    payload: any;
  }) {
    this.server.to(clientId).emit(event, payload);
  }

  // ===== 事件：房间与玩家 =====
  @SubscribeMessage('joinRoom')
  onJoin(
    @MessageBody() data: { roomId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { roomId, userId } = data;

    // room must exist
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    this.socketToRoom.set(client.id, roomId);
    this.socketToUser.set(client.id, userId);
    client.join(roomId);

    room.userConnect({ userId, clientId: client.id });

    return { success: true };
  }

  @SubscribeMessage('startGame')
  onStart(
    @MessageBody() data: { roomId: string; userId?: string },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { room, user } = this.getRoomAndUser(client, ack);
    if (user.id !== room.hostId) {
      return this.fail(ack, '只有房主可以开始游戏');
    }
    room.startGame();
    return this.ok(ack);
  }

  @SubscribeMessage('msg')
  onCustomMessage(
    @MessageBody() data: WsCustomMsg,
    @ConnectedSocket() client: Socket,
  ) {
    const { user, room } = this.getRoomAndUser(client);
    room.game?.onMsg?.({ type: data.type, room, user, data: data.data });
    // client.to(roomId).emit('gameMessage', {
    //   userId: user.id,
    //   name: user.name,
    //   message: data.message,
    // });
  }

  @SubscribeMessage('setUserStatus')
  onSetStatus(
    @MessageBody() data: { userId: string; status: 'ready' | 'end' },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { roomId, userId, user, room } = this.getRoomAndUser(client, ack);
    if (room.roundStatus !== 'after') return this.fail(ack, '当前不在结算阶段');

    room.setUserStatus({ userId, status: data.status });

    return this.ok(ack);
  }

  @SubscribeMessage('restartGame')
  onRestart(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { room, user, roomId } = this.getRoomAndUser(client, ack);
    if (!room.isHost(user.id)) {
      return this.fail(ack, '只有房主可以重启房间');
    }

    room.gotoBeforeGame();

    return this.ok(ack);
  }

  @SubscribeMessage('renameUser')
  onRename(
    @MessageBody() data: { userId: string; newName: string },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { user, room } = this.getRoomAndUser(client, ack);
    if (user.id !== data.userId) {
      return this.fail(ack, '只能修改自己的名称');
    }

    const trimmed = `${data.newName || ''}`.trim();
    if (trimmed.length < 1 || trimmed.length > 16) {
      return this.fail(ack, '名称需要1-16字符');
    }
    user.name = trimmed;

    room.sync();
    return this.ok(ack);
  }

  @SubscribeMessage('updateGameSettings')
  onUpdateSettings(
    @MessageBody() data: { roomId: string; roundSeconds?: number },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { room, user, roomId } = this.getRoomAndUser(client, ack);
    if (!room.isHost(user.id)) {
      return this.fail(ack, '只有房主可以修改设置');
    }
    room.sync();
    return this.ok(ack);
  }

  // ===== 群发消息 / 消息确认 / 重同步 =====
  @SubscribeMessage('sendMessage')
  onSendMessage(
    @MessageBody() data: { text: string },
    @ConnectedSocket() client: Socket,
    ack?: Ack,
  ) {
    const { room, user } = this.getRoomAndUser(client, ack);
    const originalText = `${data?.text || ''}`;
    let text = `${originalText || ''}`.trim().slice(0, 200);
    let type: ChatMessage['type'] = 'chat';
    if (!text) return this.fail(ack, '消息为空');

    if (room.game?.onMessageBefore) {
      const instruction = room.game?.onMessageBefore({ room, user, text });
      if (instruction) {
        const { type: ins, content } = instruction;
        if (ins === 'cover') {
          if (content?.content) {
            text = content.content;
          }
          if (content?.type) {
            type = content.type;
          }
        }
      }
    }

    const msg: ChatMessage = {
      id: user.id,
      userName: user.name,
      type,
      content: text,
    };
    room.emitToAll({ event: 'message', data: msg });
    // return this.ok(ack);
  }

  @SubscribeMessage('ackMessage')
  onAckMessage(
    @MessageBody() data: { seq: number },
    @ConnectedSocket() client: Socket,
  ) {
    const { user } = this.getRoomAndUser(client);
    if (user && Number.isFinite(data?.seq)) {
      user.ackedSeq = Math.max(user.ackedSeq, Math.floor(data.seq));
    }
  }

  // ===== 延迟 / 丢包：ping-pong =====
  @SubscribeMessage('ping')
  onPing(
    @MessageBody() data: { t: number },
    ack?: (r: { t: number; serverTime: number }) => void,
  ) {
    const response = { t: data?.t ?? 0, serverTime: Date.now() };
    if (ack) ack(response);
    return response;
  }

  closeRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new WsException(`Room not found: ${roomId}`);
    }
    room.clearTimer();
    room.emitToAll({
      event: 'roomClosed',
      data: { message: 'Room has been closed by admin' },
    });
    this.rooms.delete(roomId);
    return { success: true, message: 'Room closed successfully' };
  }

  private ok(ack?: Ack) {
    const response = { success: true };
    if (ack) ack(response);
    return response;
  }

  private fail(ack: Ack | undefined, message: string) {
    const response = { success: false, message };
    if (ack) ack(response);
    return response;
  }
}

@Controller('api/game')
export class GameController {
  constructor(private gateway: GameGateway) {}

  @Get('rooms')
  @Roles(3)
  async getRooms() {
    const rooms = Array.from(this.gateway.rooms.values()).map((room) => ({
      id: room.id,
      status: room.status,
      round: room.round,
      turn: room.turn,
      users: Object.values(room.users).map((u) => ({
        id: u.id,
        name: u.name,
        connectStatus: u.connectStatus,
      })),
      hostId: room.hostId,
    }));
    return { success: true, rooms };
  }

  @Post('rooms')
  @Roles(3)
  async createRoom() {
    const newRoom = new GameRoom(this.gateway);
    this.gateway.rooms.set(newRoom.id, newRoom);
    return { success: true, roomId: newRoom.id };
  }

  @Delete('rooms/:roomId')
  @Roles(3)
  async closeRoom(@Param('roomId') roomId: string) {
    return this.gateway.closeRoom(roomId);
  }
}

@Module({
  controllers: [GameController],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GameModule {}
