import { Module, Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtAuthGuard, Public, Roles } from 'src/guards/jwt-auth.guard';
import { anonymousNameList } from 'src/config';
import { use } from 'passport';

interface Chip {
  value: number;
  count: number;
}

interface Card {
  rank:
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
    | 'A';
  suit: 'hearts' | 'diamonds' | 'clubs' | 'spades';
  isFacedown: boolean;
}

interface User {
  id: string;
  name: string;
  clientId: string;
  connectStatus: 'connected' | 'disconnected';
  chips: Chip[];
  betChips: Chip[];
  cards: Card[];
  /** 一轮里是否轮询 */
  isAsked: boolean;
  /** 是否弃牌 */
  isQuitBet: boolean;
  /** 是否全押 */
  isAllIn: boolean;
  betSum: number;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  /** 用户状态：准备或结束 */
  readyStatus: 'ready' | 'end' | null;
}

interface Message {
  id: string;
  userId: string;
  userName: string;
  content: string;
  type: 'chat' | 'system';
  timestamp: number;
}

interface PlayerResult {
  userId: string;
  userName: string;
  chipsBefore: number;
  chipsAfter: number;
  profit: number;
  isAllIn: boolean;
  isQuitBet: boolean;
  isWinner: boolean;
  handRank?: string;
  isCheckWinPre: boolean;
}

interface UserStats {
  userId: string;
  userName: string;
  winCount: number;
  maxSingleWin: number;
  maxSingleLoss: number;
  allInCount: number;
  quitBetCount: number;
  loanCount: number;
  straightFlushCount: number;
  fourOfKindCount: number;
  fullHouseCount: number;
  flushCount: number;
  straightCount: number;
  threeOfKindCount: number;
  twoPairCount: number;
  onePairCount: number;
  highCardCount: number;
  highestTotalProfit: number;
  lowestTotalProfit: number;
  currentTotalProfit: number;
}

interface RoundResult {
  round: number;
  timestamp: number;
  players: PlayerResult[];
}

interface Room {
  id: string;
  status: 'waiting' | 'playing';
  users: User[];
  hostId: string;
  round: number;
  currentPlayerId: string;
  communityCards: Card[];
  gamePhase:
    | 'waiting'
    | 'preflop'
    | 'flop'
    | 'turn'
    | 'river'
    | 'showdown'
    | 'dealing';
  winnerIds: string[];
  messages: Message[];
  results: RoundResult[];
  stats: {
    users: UserStats[];
  };
}

// 初始化筹码堆
function initializeChips(): Chip[] {
  return [
    { value: 5, count: 4 },
    { value: 10, count: 5 },
    { value: 20, count: 4 },
    { value: 50, count: 1 },
    { value: 100, count: 1 },
    { value: 200, count: 1 },
  ];
}

// 对用户按 id 排序
function sortUsers(users: User[]): User[] {
  return users
    .sort((a, b) => {
      const aId = parseInt(a.id);
      const bId = parseInt(b.id);

      // 如果都能解析为数字，按数字大小排序
      if (!isNaN(aId) && !isNaN(bId)) {
        return aId - bId;
      }

      // 如果只有一个能解析为数字，能解析的排在前面
      if (!isNaN(aId)) return -1;
      if (!isNaN(bId)) return 1;

      // 如果都不能解析为数字，按字符串排序
      return a.id.localeCompare(b.id);
    })
    .map((user, index) => ({
      ...user,
      order: index + 1, // 设置用户顺序
    }));
}

// 生成一副完整的扑克牌
function generateDeck(): Card[] {
  const ranks: Card['rank'][] = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
    'A',
  ];
  const suits: Card['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit, isFacedown: false });
    }
  }

  return deck;
}

// 洗牌函数
function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

@Public()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class HoldemGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  rooms: Map<string, Room> = new Map();
  socketToRoom: Map<string, string> = new Map();
  socketToUser: Map<string, User> = new Map();

  handleConnection(client: Socket) {
    console.log('Client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);
    const user = this.socketToUser.get(client.id);
    if (!user) {
      return;
    }
    user.connectStatus = 'disconnected';
    const roomId = this.socketToRoom.get(client.id);

    // Add system message for user disconnect
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        const disconnectMessage: Message = {
          id:
            Date.now().toString() + Math.random().toString(36).substring(2, 9),
          userId: user.id,
          userName: user.name,
          content: `${user.name} 离开了房间`,
          type: 'system',
          timestamp: Date.now(),
        };
        room.messages.push(disconnectMessage);
        // Keep only latest 50 messages
        if (room.messages.length > 50) {
          room.messages = room.messages.slice(-50);
        }

        // Broadcast new message to all room members
        this.broadcast(roomId, 'newMessage', [disconnectMessage]);
      }
    }

    this.syncRoomStatus(roomId);
  }

  broadcast(roomId: string, event: string, payload: any) {
    this.server.to(roomId).emit(event, payload);
  }

  // 广播用户动作
  broadcastUserAction(roomId: string, userId: string, action: string, amount?: number) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const user = room.users.find(u => u.id === userId);
    if (!user) {
      return;
    }
    this.broadcast(roomId, 'syncUserAction', {
      userId,
      userName: user.name,
      action,
      amount,
      timestamp: Date.now()
    });
  }

  to(roomId: string, userId: string, event: string, payload: any) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error('Room not found:', roomId);
      return;
    }

    const user = room.users.find((u) => u.id === userId);
    if (!user) {
      console.error('User not found in room:', userId);
      return;
    }

    const socketId = user.clientId;
    this.server.to(socketId).emit(event, payload);
  }

  syncRoomStatus(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.error('Room not found:', roomId);
      return;
    }

    // Send status to each player individually
    for (const user of room.users) {
      // Process community cards
      const processedCommunityCards = room.communityCards.map((card) => {
        if (card.isFacedown) {
          return { isFacedown: true };
        }
        return card;
      });

      // Process users (hide other players' facedown cards)
      const processedUsers = room.users.map((u) => {
        const {
          id,
          name,
          chips,
          betChips,
          cards,
          connectStatus,
          isSmallBlind,
          isBigBlind,
          isAllIn,
          isQuitBet,
          isAsked,
          betSum,
          readyStatus,
        } = u;

        const processedCards = cards.map((card) => {
          // 用户自身总能看到自己的牌
          if (u.id === user.id) {
            return { ...card, isFacedown: false };
          }
          // 其他人的牌未开牌时看不到
          if (card.isFacedown) {
            return { isFacedown: true };
          }
          return card;
        });

        return {
          id,
          name,
          chips,
          betChips,
          cards: processedCards,
          connectStatus,
          isSmallBlind,
          isBigBlind,
          isAllIn,
          isQuitBet,
          isAsked,
          betSum,
          readyStatus,
        };
      });

      const payload = {
        timestamp: Date.now(),
        roomId,
        round: room.round,
        status: room.status,
        users: processedUsers,
        communityCards: processedCommunityCards,
        hostId: room.hostId,
        currentPlayerId: room.currentPlayerId,
        winnerIds: room.winnerIds,
        gamePhase: room.gamePhase,
      };

      this.to(roomId, user.id, 'syncRoomStatus', payload);
    }
  }

  @SubscribeMessage('joinRoom')
  async joinRoom(
    @MessageBody() data: { roomId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    console.log('joinRoom method called:', data);

    const { roomId, userId } = data;
    let room: Room;

    // Check if room exists
    room = this.rooms.get(roomId);
    if (!room) {
      console.log('Room not found, creating new room:', roomId);
      // Create new room
      room = {
          id: roomId,
          status: 'waiting',
          users: [],
          hostId: userId, // First user is host
          round: 0,
          currentPlayerId: '',
          communityCards: [],
          gamePhase: 'waiting',
          winnerIds: [],
          messages: [],
          results: [],
          stats: {
            users: [],
          },
        };
      this.rooms.set(roomId, room);
    }

    // Check if user exists in room
    let user = room.users.find((u) => u.id === userId);
    if (!user) {
      const randomName =
        'Player_' + Math.random().toString(36).substring(2, 10);
      user = {
        id: userId,
        name: randomName,
        clientId: client.id,
        connectStatus: 'connected',
        chips: initializeChips(),
        cards: [],
        betChips: [],
        isQuitBet: false,
        isAllIn: false,
        isSmallBlind: false,
        isBigBlind: false,
        isAsked: false,
        betSum: 0,
        readyStatus: null,
      };
      room.users.push(user);
      sortUsers(room.users);
      if (room.users.length === 1) {
        room.hostId = userId;
      }
      
      // Initialize user stats
      room.stats.users.push({
        userId: user.id,
        userName: user.name,
        winCount: 0,
        maxSingleWin: 0,
        maxSingleLoss: 0,
        allInCount: 0,
        quitBetCount: 0,
        loanCount: 0,
        straightFlushCount: 0,
        fourOfKindCount: 0,
        fullHouseCount: 0,
        flushCount: 0,
        straightCount: 0,
        threeOfKindCount: 0,
        twoPairCount: 0,
        onePairCount: 0,
        highCardCount: 0,
        highestTotalProfit: 0,
        lowestTotalProfit: 0,
        currentTotalProfit: 0,
      });
    } else {
      user.clientId = client.id;
      user.connectStatus = 'connected';
    }

    this.socketToRoom.set(client.id, roomId);
    this.socketToUser.set(client.id, user);
    client.join(roomId);

    // Send latest 5 messages to the new user
    if (room.messages.length > 0) {
      const latestMessages = room.messages.slice(-5);
      client.emit('newMessage', latestMessages);
    }

    // Add system message for user join
    const joinMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      userId: user.id,
      userName: user.name,
      content: `${user.name} 加入了房间`,
      type: 'system',
      timestamp: Date.now(),
    };
    room.messages.push(joinMessage);
    // Keep only latest 50 messages
    if (room.messages.length > 50) {
      room.messages = room.messages.slice(-50);
    }

    // Broadcast new message to all room members
    this.broadcast(roomId, 'newMessage', [joinMessage]);

    this.syncRoomStatus(roomId);
    this.broadcast(room.id, 'syncResults', room.results);
    this.broadcast(room.id, 'syncStats', room.stats);
  }

  @SubscribeMessage('startGame')
  async startGame(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);

    /** 校验 */
    const user = this.socketToUser.get(client.id);
    if (user?.id !== room.hostId) {
      return;
    }
    if (room?.users.length < 2) {
      return;
    }

    /** 初始化游戏状态 */
    room.status = 'playing';
    room.round = 1;
    room.gamePhase = 'preflop';

    /** 初始化用户状态 */
    room.currentPlayerId = room.users[0].id; // 默认第一个玩家先行动
    room.users[0].isSmallBlind = true;
    room.users[1].isBigBlind = true;

    /** 回合发牌 */
    this.dealCards(room);

    this.syncRoomStatus(roomId);
  }

  dealCards(room: Room) {
    const deck = shuffleDeck(generateDeck());
    let cardIndex = 0;
    // Deal 2 cards to each player
    for (const user of room.users) {
      user.cards = [
        { ...deck[cardIndex++], isFacedown: true },
        { ...deck[cardIndex++], isFacedown: true },
      ];
    }

    // Deal 5 community cards
    room.communityCards = [
      { ...deck[cardIndex++], isFacedown: true },
      { ...deck[cardIndex++], isFacedown: true },
      { ...deck[cardIndex++], isFacedown: true },
      { ...deck[cardIndex++], isFacedown: true },
      { ...deck[cardIndex++], isFacedown: true },
    ];
  }

  @SubscribeMessage('addChip')
  async addChip(
    @MessageBody() data: { chipValue: number; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return;
    }

    if (room.currentPlayerId !== user.id) {
      return;
    }

    // Find the chip in user's chips
    const chip = user.chips.find((c) => c.value === data.chipValue);
    if (!chip || chip.count <= 0) {
      return;
    }

    // Move chip from user's chips to betChips
    chip.count -= 1;
    user.chips = user.chips.filter((c) => c.count > 0);
    let dibChip = user.betChips.find((c) => c.value === data.chipValue);
    if (dibChip) {
      dibChip.count += 1;
    } else {
      user.betChips.push({ value: data.chipValue, count: 1 });
    }

    // 按 chip value 排序
    user.chips.sort((a, b) => a.value - b.value);
    user.betChips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
  }

  @SubscribeMessage('removeChip')
  async removeChip(
    @MessageBody() data: { chipValue: number; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return;
    }

    if (room.currentPlayerId !== user.id) {
      return;
    }

    // Find the chip in user's betChips
    const dibChip = user.betChips.find((c) => c.value === data.chipValue);
    if (!dibChip || dibChip.count <= 0) {
      return;
    }

    // Move chip from user's betChips back to chips
    dibChip.count -= 1;
    let chip = user.chips.find((c) => c.value === data.chipValue);
    if (chip) {
      chip.count += 1;
    } else {
      user.chips.push({ value: data.chipValue, count: 1 });
    }

    // 删除 count 为 0 的 chip
    user.betChips = user.betChips.filter((c) => c.count > 0);

    // 按 chip value 排序
    user.chips.sort((a, b) => a.value - b.value);
    user.betChips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
  }

  @SubscribeMessage('updateUserName')
  async updateUserName(
    @MessageBody() data: { userId: string; newName: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      client.emit('updateUserName_response', { success: false, message: 'Room not found' });
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      client.emit('updateUserName_response', { success: false, message: 'User not found' });
      return { success: false, message: 'User not found' };
    }

    const trimmedName = data.newName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 16) {
      client.emit('updateUserName_response', { success: false, message: '名称需要1-16字符' });
      return { success: false, message: '名称需要1-16字符' };
    }

    const oldName = user.name;
    user.name = trimmedName;
    
    // Add system message for name change
    const nameChangeMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      userId: user.id,
      userName: user.name,
      content: `${oldName} 改名为 ${user.name}`,
      type: 'system',
      timestamp: Date.now(),
    };
    room.messages.push(nameChangeMessage);
    // Keep only latest 50 messages
    if (room.messages.length > 50) {
      room.messages = room.messages.slice(-50);
    }

    // Broadcast new message to all room members
    this.broadcast(roomId, 'newMessage', [nameChangeMessage]);
    
    this.syncRoomStatus(roomId);
    client.emit('updateUserName_response', { success: true });
    return { success: true };
  }

  @SubscribeMessage('userSendMsg')
  async userSendMsg(
    @MessageBody() data: { content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      client.emit('userSendMsg_response', {
        error: 'Not in a room',
      });
      return {
        error: 'Not in a room',
      };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      client.emit('userSendMsg_response', {
        error: 'Room not found',
      });
      return {
        error: 'Room not found',
      };
    }

    const currentUser = this.socketToUser.get(client.id);
    if (!currentUser) {
      client.emit('userSendMsg_response', {
        error: 'User not found',
      });
      return {
        error: 'User not found',
      };
    }

    // Create chat message
    const chatMessage: Message = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
      userId: currentUser.id,
      userName: currentUser.name,
      content: data.content,
      type: 'chat',
      timestamp: Date.now(),
    };

    // Add message to room
    room.messages.push(chatMessage);
    // Keep only latest 50 messages
    if (room.messages.length > 50) {
      room.messages = room.messages.slice(-50);
    }

    // Broadcast new message to all room members
    this.broadcast(roomId, 'newMessage', [chatMessage]);

    // Send response to the player
    client.emit('userSendMsg_response', {
      success: true,
      message: chatMessage,
    });

    return {
      success: true,
      message: chatMessage,
    };
  }

  getUserBetSum(user: User): number {
    return user.betChips.reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
  }

  getMaxBet(room: Room, excludeUserId?: string): number {
    let maxBet = 0;
    for (const user of room.users) {
      if (excludeUserId && user.id === excludeUserId) {
        continue;
      }
      const betSum = this.getUserBetSum(user);
      if (betSum > maxBet) {
        maxBet = betSum;
      }
    }
    return maxBet;
  }

  /**
   * 获得下一个位置的玩家index，不考虑弃牌等等情况，纯粹下一个index。
   */
  getNextPlayerIndex(room: Room, index?: number): number {
    // 如果没有给定index也没有当前玩家id，说明是一圈下注的开始，给小盲位置
    if (index === undefined && room.currentPlayerId === '') {
      return room.users.findIndex((u) => u.isSmallBlind);
    }
    if (index === undefined) {
      index = room.users.findIndex((u) => u.id === room.currentPlayerId);
    }
    index = (index + 1) % room.users.length;
    return index;
  }

  /** 获得下一个下注玩家id，考虑所有情况 */
  getNextPlayerId(room: Room): string {
    let nextPlayerIndex = this.getNextPlayerIndex(room);
    while (true) {
      const isAsked = room.users[nextPlayerIndex].isAsked;
      if (isAsked) {
        return null;
      }
      // 如果玩家弃牌、全押或者断线了，就跳过他
      const shouldSkipThis =
        room.users[nextPlayerIndex].isQuitBet ||
        room.users[nextPlayerIndex].isAllIn ||
        room.users[nextPlayerIndex].connectStatus === 'disconnected';
      if (shouldSkipThis) {
        nextPlayerIndex = this.getNextPlayerIndex(room, nextPlayerIndex);
        continue;
      }
      return room.users[nextPlayerIndex].id;
    }
  }

  @SubscribeMessage('confirmBet')
  async confirmBet(@MessageBody() data: {}, @ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const user = this.socketToUser.get(client.id);
    if (!user || room.currentPlayerId !== user.id) {
      return;
    }

    // 校验下注金额
    const betSum = this.getUserBetSum(user);
    if ((user.isSmallBlind && betSum < 5) || (user.isBigBlind && betSum < 10)) {
      return {
        success: false,
        message: user.isSmallBlind
          ? '小盲注至少需要下注5'
          : '大盲注至少需要下注10',
      };
    }
    if (betSum < this.getMaxBet(room, user.id)) {
      return {
        success: false,
        message: `需要至少跟注${this.getMaxBet(room, user.id)}，当前你的下注总额${betSum}`,
      };
    }

    if (betSum > this.getMaxBet(room, user.id)) {
      // 加注，需要重新问询所有玩家
      room.users.forEach((u) => {
        u.isAsked = false;
      });
      user.isAsked = true;
      user.betSum = betSum;
      // 广播加注动作
      this.broadcastUserAction(roomId, user.id, 'raise', betSum);
    } else {
      // 平注
      user.isAsked = true;
      // 广播跟注动作
      this.broadcastUserAction(roomId, user.id, 'call', betSum);
    }

    // 如果确认下注后，用户的筹码已为0，则标记为allIn
    const remainingChips = user.chips.reduce(
      (sum, chip) => sum + chip.count,
      0,
    );
    if (remainingChips === 0) {
      user.isAllIn = true;
      // 广播全押动作
      this.broadcastUserAction(roomId, user.id, 'all-in', betSum);
    }

    this.gotoNextPhase(room);
  }

  @SubscribeMessage('quitBet')
  async quitBet(
    @MessageBody() data: { action: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const user = this.socketToUser.get(client.id);
    if (!user || room.currentPlayerId !== user.id) {
      return;
    }
    if (
      (user.isSmallBlind && user.betSum < 5) ||
      (user.isBigBlind && user.betSum < 10)
    ) {
      return;
    }

    user.isQuitBet = true;
    // 广播弃牌动作
    this.broadcastUserAction(roomId, user.id, 'fold');
    this.gotoNextPhase(room);
  }

  // 把这回合新加的下注都拿回去，回到上一次确认的状态
  @SubscribeMessage('takeBackBetChips')
  async takeBackBetChips(
    @MessageBody() data: {},
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const user = this.socketToUser.get(client.id);
    if (!user || room.currentPlayerId !== user.id) {
      return;
    }

    // Calculate current bet sum
    const currentBetSum = user.betChips.reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );

    // If current bet sum is less than or equal to betSum, do nothing
    if (currentBetSum <= user.betSum) {
      return { success: false, message: '还没有加注哦' };
    }

    // Calculate how much to take back
    let amountToTakeBack = currentBetSum - user.betSum;

    // Sort betChips by value in descending order
    const sortedBetChips = [...user.betChips].sort((a, b) => b.value - a.value);

    // Take back chips from highest value to lowest
    for (const betChip of sortedBetChips) {
      if (amountToTakeBack <= 0) {
        break;
      }

      // Calculate how many of this chip to take back
      const maxToTake = Math.min(
        betChip.count,
        Math.floor(amountToTakeBack / betChip.value),
      );

      if (maxToTake > 0) {
        // Remove chips from betChips
        betChip.count -= maxToTake;
        amountToTakeBack -= maxToTake * betChip.value;

        // Add chips back to user's chips
        let userChip = user.chips.find((c) => c.value === betChip.value);
        if (userChip) {
          userChip.count += maxToTake;
        } else {
          user.chips.push({ value: betChip.value, count: maxToTake });
        }
      }
    }

    // Remove betChips with count 0
    user.betChips = user.betChips.filter((c) => c.count > 0);

    // Sort chips by value
    user.chips.sort((a, b) => a.value - b.value);
    user.betChips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
  }

  @SubscribeMessage('exchangeToSmallChips')
  async exchangeToSmallChips(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check if there are more than 10 small chips (5-100, 200 ignored)
    const smallChipsCount = user.chips.find(
      (chip) => chip.value >= 5 && chip.value <= 100 && chip.count > 10,
    );

    if (smallChipsCount) {
      return { success: false, message: `有筹码超过10个了，不能再找零` };
    }

    // Find the largest chip
    const largestChip = user.chips.reduce(
      (max, chip) => (chip.value > max.value ? chip : max),
      user.chips[0],
    );

    if (!largestChip || largestChip.count === 0) {
      return { success: false, message: 'No chips to exchange' };
    }

    // Exchange rules
    const exchangeRules: Record<number, { value: number; count: number }[]> = {
      200: [
        { value: 100, count: 1 },
        { value: 50, count: 1 },
        { value: 20, count: 1 },
        { value: 10, count: 2 },
        { value: 5, count: 2 },
      ],
      100: [
        { value: 50, count: 1 },
        { value: 20, count: 1 },
        { value: 10, count: 2 },
        { value: 5, count: 2 },
      ],
      50: [
        { value: 20, count: 1 },
        { value: 10, count: 2 },
        { value: 5, count: 2 },
      ],
      20: [
        { value: 10, count: 1 },
        { value: 5, count: 2 },
      ],
    };

    const rule = exchangeRules[largestChip.value];
    if (!rule) {
      return {
        success: false,
        message: 'No exchange rule for this chip value',
      };
    }

    // Remove one largest chip
    largestChip.count -= 1;
    if (largestChip.count === 0) {
      user.chips = user.chips.filter(
        (chip) => chip.value !== largestChip.value,
      );
    }

    // Add small chips
    for (const { value, count } of rule) {
      const existingChip = user.chips.find((chip) => chip.value === value);
      if (existingChip) {
        existingChip.count += count;
      } else {
        user.chips.push({ value, count });
      }
    }

    // Sort chips by value
    user.chips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
    return { success: true };
  }

  @SubscribeMessage('exchangeToLargeChips')
  async exchangeToLargeChips(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    const chipValuesToProcess = [5, 10, 20, 50, 100];

    const conversionConfig: Record<
      number,
      {
        ratio: number;
        targetValue: number;
        minExcess: number;
        returnValue?: number;
        returnRatio?: number;
      }
    > = {
      5: { ratio: 2, targetValue: 10, minExcess: 5 },
      10: { ratio: 2, targetValue: 20, minExcess: 5 },
      20: {
        ratio: 3,
        targetValue: 50,
        minExcess: 3,
        returnValue: 10,
        returnRatio: 1,
      },
      50: { ratio: 2, targetValue: 100, minExcess: 2 },
      100: { ratio: 2, targetValue: 200, minExcess: 2 },
    };

    let exchanged = false;

    for (let i = 0; i < chipValuesToProcess.length; i++) {
      const chipValue = chipValuesToProcess[i];
      const targetChip = user.chips.find((chip) => chip.value === chipValue);
      if (!targetChip || targetChip.count <= 5) {
        continue;
      }

      const config = conversionConfig[chipValue];
      if (!config) {
        continue;
      }

      const excessCount = targetChip.count - 5;

      // Check if excess count meets minimum requirement
      if (excessCount < config.minExcess) {
        continue;
      }

      const convertCount =
        Math.floor(excessCount / config.ratio) * config.ratio;

      if (convertCount < config.ratio) {
        continue;
      }

      const convertedCount = convertCount / config.ratio;
      const remainingCount = excessCount - convertCount;

      targetChip.count = 5 + remainingCount;

      const targetChipInUser = user.chips.find(
        (chip) => chip.value === config.targetValue,
      );
      if (targetChipInUser) {
        targetChipInUser.count += convertedCount;
      } else {
        user.chips.push({ value: config.targetValue, count: convertedCount });
      }

      if (config.returnValue && config.returnRatio) {
        const returnChipInUser = user.chips.find(
          (chip) => chip.value === config.returnValue,
        );
        if (returnChipInUser) {
          returnChipInUser.count += convertedCount * config.returnRatio;
        } else {
          user.chips.push({
            value: config.returnValue,
            count: convertedCount * config.returnRatio,
          });
        }
      }

      exchanged = true;
    }

    if (!exchanged) {
      return { success: false, message: '筹码数量不够化整' };
    }

    user.chips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
    return { success: true };
  }

  @SubscribeMessage('loan')
  async loan(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check if user has already bet
    if (user.betSum > 0) {
      return { success: false, message: '已经下注' };
    }

    // Check if user's current chips value is greater than 100
    const currentChipsValue = user.chips.reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (currentChipsValue > 100) {
      return { success: false, message: '存款高于100不能贷款' };
    }

    // Loan amount: 500
    // Initial chip structure: 4×5, 5×10, 4×20, 1×50, 1×100, 1×200
    const loanChips = [
      { value: 5, count: 4 },
      { value: 10, count: 5 },
      { value: 20, count: 4 },
      { value: 50, count: 1 },
      { value: 100, count: 1 },
      { value: 200, count: 1 },
    ];

    // Add loan chips to user's chips
    for (const loanChip of loanChips) {
      const existingChip = user.chips.find(
        (chip) => chip.value === loanChip.value,
      );
      if (existingChip) {
        existingChip.count += loanChip.count;
      } else {
        user.chips.push({ value: loanChip.value, count: loanChip.count });
      }
    }

    // Sort chips by value
    user.chips.sort((a, b) => a.value - b.value);

    // Update loan count in stats
    const userStat = room.stats.users.find(stat => stat.userId === user.id);
    if (userStat) {
      userStat.loanCount++;
    }

    this.syncRoomStatus(roomId);
    return { success: true };
  }

  @SubscribeMessage('repay')
  async repay(
    @MessageBody() data: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Check if user's current chips value (excluding bet) is less than 800
    const currentChipsValue = user.chips.reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (currentChipsValue < 800) {
      return { success: false, message: '低于800不能还款' };
    }

    // Repay amount: 500
    let amountToRepay = 500;

    // Sort chips by value in descending order
    const sortedChips = [...user.chips].sort((a, b) => b.value - a.value);

    // Remove chips from highest value to lowest
    for (const chip of sortedChips) {
      if (amountToRepay <= 0) {
        break;
      }

      // Calculate how many of this chip to remove
      const maxToRemove = Math.min(
        chip.count,
        Math.floor(amountToRepay / chip.value),
      );

      if (maxToRemove > 0) {
        chip.count -= maxToRemove;
        amountToRepay -= maxToRemove * chip.value;
      }
    }

    // Remove chips with count 0
    user.chips = user.chips.filter((chip) => chip.count > 0);

    // Sort chips by value
    user.chips.sort((a, b) => a.value - b.value);

    this.syncRoomStatus(roomId);
    return { success: true };
  }

  @SubscribeMessage('setUserStatus')
  async setUserStatus(
    @MessageBody() data: { userId: string; status: 'ready' | 'end' },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    const user = room.users.find((u) => u.id === data.userId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }

    // Set user status
    user.readyStatus = data.status;

    // Broadcast user status update
    this.broadcast(room.id, 'syncUserStatus', room.users.map((u) => ({
      id: u.id,
      readyStatus: u.readyStatus,
    })));

    // Check if all users are ready
    const allReady = room.users.every((u) => u.readyStatus === 'ready');
    if (allReady) {
      // Start next round
      const smallBlindIndex = room.users.findIndex((u) => u.isSmallBlind);
      const bigBlindIndex = room.users.findIndex((u) => u.isBigBlind);

      // 清除旧的盲注标记
      room.users[smallBlindIndex].isSmallBlind = false;
      room.users[bigBlindIndex].isBigBlind = false;

      // 轮换盲注：大盲变小盲，小盲的下一个位置变大盲
      room.users[bigBlindIndex].isSmallBlind = true;
      const nextBigBlindIndex = this.getNextPlayerIndex(room, bigBlindIndex);
      room.users[nextBigBlindIndex].isBigBlind = true;

      room.communityCards = [];
      room.users.forEach((u) => {
        u.cards = [];
        u.isQuitBet = false;
        u.isAllIn = false;
        u.readyStatus = null;
      });
      room.gamePhase = 'preflop';
      room.round += 1;
      room.currentPlayerId = room.users[bigBlindIndex].id;
      room.winnerIds = [];
      this.dealCards(room);
      this.syncRoomStatus(room.id);
    }

    // Check if all users want to end the game
    const allEnd = room.users.every((u) => u.readyStatus === 'end');
    if (allEnd) {
      // End game logic
      room.status = 'waiting';
      room.users.forEach((u) => {
        u.readyStatus = null;
      });
      this.syncRoomStatus(room.id);
    }

    return { success: true };
  }

  @SubscribeMessage('allIn')
  async allIn(
    @MessageBody() data: { action: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) {
      return;
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }
    const user = this.socketToUser.get(client.id);
    if (!user || room.currentPlayerId !== user.id) {
      return;
    }

    // 将用户所有筹码都移到 betChips
    for (const chip of user.chips) {
      let dibChip = user.betChips.find((c) => c.value === chip.value);
      if (dibChip) {
        dibChip.count += chip.count;
      } else {
        user.betChips.push({ value: chip.value, count: chip.count });
      }
    }
    user.chips = [];
    user.betChips.sort((a, b) => a.value - b.value);
    
    // 计算全押金额
    const betSum = this.getUserBetSum(user);
    // 广播全押动作
    this.broadcastUserAction(roomId, user.id, 'all-in', betSum);

    this.syncRoomStatus(room.id);
  }

  checkWinPre(room: Room): {
    users: User[];
    handRanks: Record<string, string>;
    isCheckWinPre: boolean;
  } | null {
    // 如果只有一个玩家没有弃牌，则直接获胜
    const activeUsers = room.users.filter((u) => !u.isQuitBet);
    if (activeUsers.length === 1) {
      const handRanks: Record<string, string> = {};
      activeUsers.forEach((user) => {
        handRanks[user.id] = '无牌型（对手弃牌）';
      });
      return {
        users: activeUsers,
        handRanks,
        isCheckWinPre: true,
      };
    }
    return null;
  }

  checkWin(
    room: Room,
  ): { users: User[]; handRanks: Record<string, string> } | null {
    const rankValueMap: Record<Card['rank'], number> = {
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
      '8': 8,
      '9': 9,
      '10': 10,
      J: 11,
      Q: 12,
      K: 13,
      A: 14,
    };

    const getRankValue = (card: Card) => rankValueMap[card.rank];

    const sortCardsDesc = (cards: Card[]) =>
      [...cards].sort((a, b) => getRankValue(b) - getRankValue(a));

    const groupByRank = (cards: Card[]) => {
      const map = new Map<number, Card[]>();
      for (const card of cards) {
        const value = getRankValue(card);
        if (!map.has(value)) map.set(value, []);
        map.get(value)!.push(card);
      }
      return map;
    };

    const groupBySuit = (cards: Card[]) => {
      const map = new Map<Card['suit'], Card[]>();
      for (const card of cards) {
        if (!map.has(card.suit)) map.set(card.suit, []);
        map.get(card.suit)!.push(card);
      }
      return map;
    };

    const compareValues = (a: number[], b: number[]) => {
      for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av !== bv) return av - bv;
      }
      return 0;
    };

    const getStraightCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const values = Array.from(rankMap.keys()).sort((a, b) => b - a);
      const valueSet = new Set(values);
      if (valueSet.has(14)) {
        valueSet.add(1);
        values.push(1);
      }

      for (const start of values) {
        const seq = [start, start - 1, start - 2, start - 3, start - 4];
        if (seq.every((v) => valueSet.has(v))) {
          const straightCards = seq.map((v) => {
            const realValue = v === 1 ? 14 : v;
            const cardsForRank = rankMap.get(realValue) || [];
            return cardsForRank[0];
          });
          return { cards: straightCards, values: seq };
        }
      }
      return null;
    };

    const getFlushCards = (cards: Card[]) => {
      const suitMap = groupBySuit(cards);
      let best: { cards: Card[]; values: number[] } | null = null;
      for (const suitCards of suitMap.values()) {
        if (suitCards.length < 5) continue;
        const sorted = sortCardsDesc(suitCards).slice(0, 5);
        const values = sorted.map((c) => getRankValue(c));
        if (!best || compareValues(values, best.values) > 0) {
          best = { cards: sorted, values };
        }
      }
      return best;
    };

    const getStraightFlushCards = (cards: Card[]) => {
      const suitMap = groupBySuit(cards);
      let best: { cards: Card[]; values: number[] } | null = null;
      for (const suitCards of suitMap.values()) {
        if (suitCards.length < 5) continue;
        const straight = getStraightCards(suitCards);
        if (straight) {
          if (!best || compareValues(straight.values, best.values) > 0) {
            best = straight;
          }
        }
      }
      return best;
    };

    const getFourOfKindCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const quad = groups.find((g) => g.list.length === 4);
      if (!quad) return null;
      const remaining = sortCardsDesc(
        cards.filter((c) => getRankValue(c) !== quad.value),
      );
      const kicker = remaining[0];
      const quadCards = quad.list.slice(0, 4);
      const bestCards = [...quadCards, kicker];
      const values = [
        quad.value,
        quad.value,
        quad.value,
        quad.value,
        getRankValue(kicker),
      ];
      return { cards: bestCards, values };
    };

    const getFullHouseCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const trips = groups.filter((g) => g.list.length >= 3);
      if (trips.length === 0) return null;
      const trip = trips[0];
      const remainingPairs = groups
        .filter((g) => g.value !== trip.value && g.list.length >= 2)
        .sort((a, b) => b.value - a.value);
      if (remainingPairs.length === 0) {
        if (trips.length < 2) return null;
        const pairFromTrip = trips[1];
        const bestCards = [
          ...trip.list.slice(0, 3),
          ...pairFromTrip.list.slice(0, 2),
        ];
        const values = [
          trip.value,
          trip.value,
          trip.value,
          pairFromTrip.value,
          pairFromTrip.value,
        ];
        return { cards: bestCards, values };
      }
      const pair = remainingPairs[0];
      const bestCards = [...trip.list.slice(0, 3), ...pair.list.slice(0, 2)];
      const values = [
        trip.value,
        trip.value,
        trip.value,
        pair.value,
        pair.value,
      ];
      return { cards: bestCards, values };
    };

    const getThreeOfKindCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const trip = groups.find((g) => g.list.length >= 3);
      if (!trip) return null;
      const remaining = sortCardsDesc(
        cards.filter((c) => getRankValue(c) !== trip.value),
      ).slice(0, 2);
      const bestCards = [...trip.list.slice(0, 3), ...remaining];
      const values = [
        trip.value,
        trip.value,
        trip.value,
        ...remaining.map((c) => getRankValue(c)),
      ];
      return { cards: bestCards, values };
    };

    const getTwoPairCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const pairs = groups.filter((g) => g.list.length >= 2);
      if (pairs.length < 2) return null;
      const highPair = pairs[0];
      const lowPair = pairs[1];
      const remaining = sortCardsDesc(
        cards.filter(
          (c) =>
            getRankValue(c) !== highPair.value &&
            getRankValue(c) !== lowPair.value,
        ),
      );
      const kicker = remaining[0];
      const bestCards = [
        ...highPair.list.slice(0, 2),
        ...lowPair.list.slice(0, 2),
        kicker,
      ];
      const values = [
        highPair.value,
        highPair.value,
        lowPair.value,
        lowPair.value,
        getRankValue(kicker),
      ];
      return { cards: bestCards, values };
    };

    const getOnePairCards = (cards: Card[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const pair = groups.find((g) => g.list.length >= 2);
      if (!pair) return null;
      const remaining = sortCardsDesc(
        cards.filter((c) => getRankValue(c) !== pair.value),
      ).slice(0, 3);
      const bestCards = [...pair.list.slice(0, 2), ...remaining];
      const values = [
        pair.value,
        pair.value,
        ...remaining.map((c) => getRankValue(c)),
      ];
      return { cards: bestCards, values };
    };

    const getHighCardCards = (cards: Card[]) => {
      const bestCards = sortCardsDesc(cards).slice(0, 5);
      const values = bestCards.map((c) => getRankValue(c));
      return { cards: bestCards, values };
    };

    const evaluateBestHand = (cards: Card[]) => {
      const straightFlush = getStraightFlushCards(cards);
      if (straightFlush)
        return { score: 9, handRank: '同花顺', ...straightFlush };
      const fourOfKind = getFourOfKindCards(cards);
      if (fourOfKind) return { score: 8, handRank: '四条', ...fourOfKind };
      const fullHouse = getFullHouseCards(cards);
      if (fullHouse) return { score: 7, handRank: '葫芦', ...fullHouse };
      const flush = getFlushCards(cards);
      if (flush) return { score: 6, handRank: '同花', ...flush };
      const straight = getStraightCards(cards);
      if (straight) return { score: 5, handRank: '顺子', ...straight };
      const threeOfKind = getThreeOfKindCards(cards);
      if (threeOfKind) return { score: 4, handRank: '三条', ...threeOfKind };
      const twoPair = getTwoPairCards(cards);
      if (twoPair) return { score: 3, handRank: '两对', ...twoPair };
      const onePair = getOnePairCards(cards);
      if (onePair) return { score: 2, handRank: '一对', ...onePair };
      const highCard = getHighCardCards(cards);
      return { score: 1, handRank: '高牌', ...highCard };
    };

    const activeUsers = room.users.filter((u) => !u.isQuitBet);
    if (activeUsers.length === 0) return null;

    const evaluations = activeUsers.map((user) => {
      const allCards = [...user.cards, ...room.communityCards];
      const result = evaluateBestHand(allCards);
      return { user, ...result };
    });

    const maxScore = Math.max(...evaluations.map((e) => e.score));
    const top = evaluations.filter((e) => e.score === maxScore);

    let best = top[0];
    for (const candidate of top.slice(1)) {
      if (compareValues(candidate.values, best.values) > 0) {
        best = candidate;
      }
    }

    const winners = top.filter(
      (e) => compareValues(e.values, best.values) === 0,
    );

    const handRanks: Record<string, string> = {};
    evaluations.forEach((e) => {
      handRanks[e.user.id] = e.handRank!;
    });

    return {
      users: winners.map((w) => w.user),
      handRanks,
    };
  }

  gotoNextPhase(room: Room) {
    // 如果只剩一人未弃牌，则直接获胜
    const winPreResult = this.checkWinPre(room);
    if (winPreResult?.users.length > 0) {
      this.finishRound(room, winPreResult);
      return;
    }
    const nextPlayerId = this.getNextPlayerId(room);
    if (nextPlayerId !== null) {
      // 还有要下注的玩家
      room.currentPlayerId = nextPlayerId;
      this.syncRoomStatus(room.id);
    } else {
      room.currentPlayerId = '';
      if (room.gamePhase === 'river') {
        // 最后一圈结束，结算
        room.gamePhase = 'showdown';
        // 开牌：只有未弃牌的玩家的牌会显示出来
        room.users.forEach((user) => {
          if (!user.isQuitBet) {
            user.cards.forEach((card) => {
              card.isFacedown = false;
            });
          }
        });
        const winResult = this.checkWin(room);
        if (winResult?.users.length > 0) {
          this.finishRound(room, { ...winResult, isCheckWinPre: false });
        }
        return;
      } else {
        // 进入下一圈
        if (room.gamePhase === 'preflop') {
          room.gamePhase = 'flop';
          room.communityCards
            .slice(0, 3)
            .forEach((c) => (c.isFacedown = false));
        } else if (room.gamePhase === 'flop') {
          room.gamePhase = 'turn';
          room.communityCards[3].isFacedown = false;
        } else if (room.gamePhase === 'turn') {
          room.gamePhase = 'river';
          room.communityCards[4].isFacedown = false;
        }
        this.syncRoomStatus(room.id);
        // 下一圈下注
        setTimeout(() => {
          room.users.forEach((u) => {
            u.isAsked = false;
          });
          room.currentPlayerId = this.getNextPlayerId(room);
          this.syncRoomStatus(room.id);
        }, 5000);
      }
    }
  }

  giveChipsToWinners(room: Room, winners: User[]) {
    const getUserBetSum = (user: User) =>
      user.betChips.reduce((sum, chip) => sum + chip.value * chip.count, 0);

    // 特殊逻辑：如果只有一个赢家且他没有all-in，直接把所有betChips垒给他
    if (winners.length === 1 && !winners[0].isAllIn) {
      const winner = winners[0];
      for (const user of room.users) {
        if (user.id !== winner.id) {
          // 把其他玩家的betChips加到赢家的chips里
          for (const betChip of user.betChips) {
            const existingChip = winner.chips.find(
              (c) => c.value === betChip.value,
            );
            if (existingChip) {
              existingChip.count += betChip.count;
            } else {
              winner.chips.push({ value: betChip.value, count: betChip.count });
            }
          }
        }
      }
      // 把赢家自己的betChips也加到chips里
      for (const betChip of winner.betChips) {
        const existingChip = winner.chips.find(
          (c) => c.value === betChip.value,
        );
        if (existingChip) {
          existingChip.count += betChip.count;
        } else {
          winner.chips.push({ value: betChip.value, count: betChip.count });
        }
      }
      winner.chips.sort((a, b) => a.value - b.value);

      // 清理下注区
      room.users.forEach((u) => {
        u.betChips = [];
        u.betSum = 0;
      });
      return;
    }

    const chipValues = [200, 100, 50, 20, 10, 5];

    const addChipsToUser = (user: User, amount: number) => {
      let remaining = amount;
      for (const value of chipValues) {
        const count = Math.floor(remaining / value);
        if (count <= 0) continue;
        const existing = user.chips.find((c) => c.value === value);
        if (existing) {
          existing.count += count;
        } else {
          user.chips.push({ value, count });
        }
        remaining -= count * value;
      }
      user.chips.sort((a, b) => a.value - b.value);
    };

    const contributions = room.users.map((user) => ({
      user,
      amount: getUserBetSum(user),
    }));

    const levels = Array.from(
      new Set(contributions.map((c) => c.amount).filter((v) => v > 0)),
    ).sort((a, b) => a - b);

    if (levels.length === 0) {
      return;
    }

    let prevLevel = 0;
    for (const level of levels) {
      const eligibleContributors = contributions.filter(
        (c) => c.amount >= level,
      );
      const potAmount = (level - prevLevel) * eligibleContributors.length;
      if (potAmount <= 0) {
        prevLevel = level;
        continue;
      }

      const eligibleUsers = room.users.filter(
        (u) => !u.isQuitBet && getUserBetSum(u) >= level,
      );

      if (eligibleUsers.length === 0) {
        prevLevel = level;
        continue;
      }

      const potWinResult = this.checkWin({ ...room, users: eligibleUsers });
      const potWinners = potWinResult?.users || winners || [];

      if (potWinners.length === 0) {
        prevLevel = level;
        continue;
      }

      const unit = 5;
      const potUnits = Math.floor(potAmount / unit);
      const baseUnits = Math.floor(potUnits / potWinners.length);
      let remainderUnits = potUnits % potWinners.length;

      for (const winner of potWinners) {
        const payoutUnits = baseUnits + (remainderUnits > 0 ? 1 : 0);
        if (remainderUnits > 0) remainderUnits -= 1;
        const payoutAmount = payoutUnits * unit;
        if (payoutAmount > 0) {
          addChipsToUser(winner, payoutAmount);
        }
      }

      prevLevel = level;
    }

    // 清理下注区
    room.users.forEach((u) => {
      u.betChips = [];
      u.betSum = 0;
    });
  }

  finishRound(
    room: Room,
    winResult: {
      users: User[];
      handRanks: Record<string, string>;
      isCheckWinPre: boolean;
    },
  ) {
    room.currentPlayerId = '';
    room.winnerIds = winResult.users.map((w) => w.id);

    // 计算每局开始前的筹码数量
    const chipsBefore: Record<string, number> = {};
    room.users.forEach((user) => {
      chipsBefore[user.id] =
        user.chips.reduce((sum, chip) => sum + chip.value * chip.count, 0) +
        user.betChips.reduce((sum, chip) => sum + chip.value * chip.count, 0);
    });

    this.giveChipsToWinners(room, winResult.users);

    // 计算每局结束后的筹码数量和利润
    const players: PlayerResult[] = room.users.map((user) => {
      const chipsAfter = user.chips.reduce(
        (sum, chip) => sum + chip.value * chip.count,
        0,
      );
      const profit = chipsAfter - chipsBefore[user.id];
      return {
        userId: user.id,
        userName: user.name,
        chipsBefore: chipsBefore[user.id],
        chipsAfter,
        profit,
        isAllIn: user.isAllIn,
        isQuitBet: user.isQuitBet,
        isWinner: winResult.users.some((w) => w.id === user.id),
        handRank: winResult.handRanks[user.id],
        isCheckWinPre: winResult.isCheckWinPre,
      };
    });

    // 记录本局结果
    const roundResult: RoundResult = {
      round: room.round,
      timestamp: Date.now(),
      players,
    };
    room.results.push(roundResult);

    // Update user stats
    for (const player of players) {
      const userStat = room.stats.users.find(stat => stat.userId === player.userId);
      if (userStat) {
        // Update win count
        if (player.isWinner) {
          userStat.winCount++;
        }
        
        // Update max single win/loss
        if (player.profit > 0 && player.profit > userStat.maxSingleWin) {
          userStat.maxSingleWin = player.profit;
        } else if (player.profit < 0 && player.profit < userStat.maxSingleLoss) {
          userStat.maxSingleLoss = player.profit;
        }
        
        // Update all-in count
        if (player.isAllIn) {
          userStat.allInCount++;
        }
        
        // Update quit bet count
        if (player.isQuitBet) {
          userStat.quitBetCount++;
        }
        
        // Update hand rank stats
        if (player.handRank) {
          if (player.handRank.includes('同花顺')) {
            userStat.straightFlushCount++;
          } else if (player.handRank.includes('四条')) {
            userStat.fourOfKindCount++;
          } else if (player.handRank.includes('葫芦')) {
            userStat.fullHouseCount++;
          } else if (player.handRank.includes('同花')) {
            userStat.flushCount++;
          } else if (player.handRank.includes('顺子')) {
            userStat.straightCount++;
          } else if (player.handRank.includes('三条')) {
            userStat.threeOfKindCount++;
          } else if (player.handRank.includes('两对')) {
            userStat.twoPairCount++;
          } else if (player.handRank.includes('一对')) {
            userStat.onePairCount++;
          } else if (player.handRank.includes('高牌')) {
            userStat.highCardCount++;
          }
        }
        
        // Update highest/lowest total profit (cumulative profit, starting from 0)
        // First, calculate current total profit by summing all previous profits
        const totalProfit = room.results.reduce((sum, result) => {
          const playerResult = result.players.find(p => p.userId === player.userId);
          return sum + (playerResult?.profit || 0);
        }, 0);
        
        // Update current total profit
        userStat.currentTotalProfit = totalProfit;
        
        // Update highest and lowest total profit
        if (totalProfit > userStat.highestTotalProfit) {
          userStat.highestTotalProfit = totalProfit;
        }
        if (totalProfit < userStat.lowestTotalProfit) {
          userStat.lowestTotalProfit = totalProfit;
        }
        
        // Update user name if changed
        userStat.userName = player.userName;
      }
    }

    // Broadcast results to all players
    this.broadcast(room.id, 'syncResults', room.results);
    
    // Broadcast stats to all players
    this.broadcast(room.id, 'syncStats', room.stats);

    this.syncRoomStatus(room.id);

    // Reset user ready status for next round preparation
    room.users.forEach((u) => {
      u.readyStatus = null;
    });

    // Broadcast user status update
    this.broadcast(room.id, 'syncUserStatus', room.users.map((u) => ({
      id: u.id,
      readyStatus: u.readyStatus,
    })));
  }

  stopBet(room: Room): boolean {
    const activeUsers = room.users.filter((u) => !u.isQuitBet && !u.isAllIn);
    if (activeUsers.length === 0) {
      return true;
    }
    const betSum = this.getUserBetSum(activeUsers[0]);
    return activeUsers.every((u) => this.getUserBetSum(u) === betSum);
  }

  // 关闭房间
  closeRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    // 广播房间关闭消息
    this.broadcast(roomId, 'roomClosed', { message: 'Room has been closed by admin' });

    // 移除房间
    this.rooms.delete(roomId);
    return { success: true, message: 'Room closed successfully' };
  }
}

@Controller('holdem')
export class HoldemController {
  constructor(private holdemGateway: HoldemGateway) {}

  // 管理员获取所有房间列表
  @Get('rooms')
  @UseGuards(JwtAuthGuard)
  @Roles(1) // 假设 1 是管理员角色
  async getRooms() {
    const rooms = Array.from(this.holdemGateway.rooms.entries()).map(([id, room]) => ({
      id,
      status: room.status,
      userCount: room.users.length,
      hostId: room.hostId,
      round: room.round,
    }));
    return { success: true, rooms };
  }

  // 管理员关闭房间
  @Get('rooms/:roomId/close')
  @UseGuards(JwtAuthGuard)
  @Roles(1) // 假设 1 是管理员角色
  async closeRoom(@Param('roomId') roomId: string) {
    return this.holdemGateway.closeRoom(roomId);
  }
}

@Module({
  controllers: [HoldemController],
  providers: [HoldemGateway],
  exports: [HoldemGateway],
})
export class HoldemModule {}
