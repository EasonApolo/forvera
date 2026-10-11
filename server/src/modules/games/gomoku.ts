import { Game, GameRoom, GameUser } from '../game.module';
import { PhaseCtx } from 'shared/types/game';
import {
  GOMOKU_BOARD_SIZE,
  GomokuColor,
  GomokuCustomMsgTypes,
  PlaceStoneDTO,
} from 'shared/types/games/gomoku';

const isInsideBoard = (x: number, y: number) =>
  x >= 0 && x < GOMOKU_BOARD_SIZE && y >= 0 && y < GOMOKU_BOARD_SIZE;

function createEmptyBoard(): (GomokuColor | '')[] {
  return Array.from(
    { length: GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE },
    () => '' as GomokuColor | '',
  );
}

function hasFiveInRow(board: (GomokuColor | '')[], x: number, y: number, color: GomokuColor) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;

  for (const [dx, dy] of directions) {
    let count = 1;

    let nx = x + dx;
    let ny = y + dy;
    while (isInsideBoard(nx, ny) && board[ny * GOMOKU_BOARD_SIZE + nx] === color) {
      count += 1;
      nx += dx;
      ny += dy;
    }

    nx = x - dx;
    ny = y - dy;
    while (isInsideBoard(nx, ny) && board[ny * GOMOKU_BOARD_SIZE + nx] === color) {
      count += 1;
      nx -= dx;
      ny -= dy;
    }

    if (count >= 5) {
      return true;
    }
  }

  return false;
}

class Gomoku implements Game {
  room: GameRoom;

  constructor({ room }: { room: GameRoom }) {
    this.room = room;
  }

  onInitGame({ room }: { room: GameRoom }) {}

  onStartGame({ room }: { room: GameRoom }) {
    room.register('blackUserId', 'public');
    room.register('whiteUserId', 'public');
    room.register('currentPlayerId', 'public');
    room.register('board', 'public');
    room.register('lastMoveUserId', 'public');
    room.register('winnerId', 'public');
    room.register('isDraw', 'public');
    room.register('lastMove', 'public');
    Object.values(room.users).forEach((user) => {
      user.register('totalScore', 'public');
    });
  }

  // 一局棋（round）：定黑白、清盘
  onBeforeRoundStart({ room }: { room: GameRoom }) {
    room.shuffleUsers();
    const [black, white] = room.userOrder;
    room.blackUserId = black || '';
    room.whiteUserId = white || '';
    room.board = createEmptyBoard();
    room.winnerId = '';
    room.isDraw = false;
    room.lastMove = null;
    room.lastMoveUserId = '';
    room.sync();
    return { skip: true };
  }

  // 落子无前置阶段；轮到谁由 turn 奇偶决定（turn 1 黑先）
  onBeforeTurnStart({ room }: { room: GameRoom }) {
    room.currentPlayerId =
      room.turn % 2 === 1 ? room.blackUserId : room.whiteUserId;
    return { skip: true };
  }

  // 等待落子，不限时
  onIngTurnStart({ room }: { room: GameRoom }) {
    return {};
  }

  // 落子后无展示阶段，直接进入下一手
  onAfterTurnStart({ room }: { room: GameRoom }) {
    return { skip: true };
  }

  onAfterTurnEnd({ room }: { room: GameRoom }) {
    if (room.winnerId || room.isDraw || this.isBoardFull(room)) {
      room.gotoAfterRound();
    } else {
      room.gotoBeforeTurn();
    }
  }

  onAfterRoundStart({ room }: { room: GameRoom }) {
    const highestScore = Math.max(
      ...Object.values(room.users).map((user) => user.totalScore || 0),
      0,
    );
    const roundResults = Object.values(room.users).reduce(
      (acc, user) => {
        acc[user.id] = { isWinner: (user.totalScore || 0) === highestScore && highestScore > 0 };
        return acc;
      },
      {} as { [userId: string]: { isWinner: boolean } },
    );
    room.setRoundResult({ users: roundResults });
  }

  private isBoardFull(room: GameRoom) {
    return (room.board || []).every((cell) => cell !== '');
  }

  private colorOf(room: GameRoom, userId: string): GomokuColor | '' {
    if (room.blackUserId === userId) return 'black';
    if (room.whiteUserId === userId) return 'white';
    return '';
  }

  onPlaceStone({
    room,
    user,
    data,
    ctx,
  }: {
    room: GameRoom;
    user: GameUser;
    data: PlaceStoneDTO;
    ctx?: PhaseCtx;
  }) {
    if (!room.isGamePlaying() || !room.checkPhase(ctx, { turnStatus: ['ing'] })) return;
    if (room.currentPlayerId !== user.id) return;
    const color = this.colorOf(room, user.id);
    if (!color) return;

    const x = Number(data?.x);
    const y = Number(data?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !isInsideBoard(x, y)) return;
    const index = y * GOMOKU_BOARD_SIZE + x;
    if (room.board[index]) return;

    room.board = [...room.board];
    room.board[index] = color;
    room.lastMove = { x, y };
    room.lastMoveUserId = user.id;

    if (hasFiveInRow(room.board, x, y, color)) {
      room.winnerId = user.id;
      user.totalScore = (user.totalScore || 0) + 1;
    } else if (this.isBoardFull(room)) {
      room.isDraw = true;
    }

    room.sync();
    room.gotoAfterTurn();
  }

  /** 悔棋：只能撤回最近一手，且必须是自己下的、此刻已轮到别人；悔过后不可连续悔 */
  canUndo(room: GameRoom, userId: string): boolean {
    if (!room.isGamePlaying() || room.roundStatus !== 'ing') return false;
    if (room.winnerId || room.isDraw) return false;
    if (!room.lastMove || !room.lastMoveUserId) return false;
    return room.lastMoveUserId === userId && room.currentPlayerId !== userId;
  }

  onUndo({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!room.checkPhase(ctx, { turnStatus: ['ing'] })) return;
    if (!this.canUndo(room, user.id)) return;
    const last = room.lastMove!;

    // 撤子；不保留更早的历史，悔棋后 lastMove 清空（不可连续悔，直到有新落子）
    room.board = [...room.board];
    room.board[last.y * GOMOKU_BOARD_SIZE + last.x] = '';
    room.lastMove = null;
    room.lastMoveUserId = '';
    room.sync();

    room.emitToAll({
      event: 'message',
      data: {
        id: `system-${Date.now()}`,
        userName: '',
        type: 'system',
        content: `${user.name} 悔了一步棋`,
      },
    });

    // 回到上个 turn：当前是 turn N（等 P_N 落子），撤回的是 turn N-1 的手
    // turn 设为 N-2 后走 gotoBeforeTurn（内部 +1），恢复 parity 对应的原玩家
    room.turn = Math.max(0, room.turn - 2);
    room.gotoBeforeTurn();
  }

  /** 认输：对手直接获胜 */
  onResign({ room, user }: { room: GameRoom; user: GameUser }) {
    if (!room.isGamePlaying() || room.roundStatus !== 'ing' || room.turnStatus === 'after') return;
    if (room.winnerId || room.isDraw) return;
    const opponentId = room.blackUserId === user.id
      ? room.whiteUserId
      : room.whiteUserId === user.id
        ? room.blackUserId
        : '';
    if (!opponentId) return; // 观战者不能认输

    room.winnerId = opponentId;
    const opponent = room.users[opponentId];
    if (opponent) {
      opponent.totalScore = (opponent.totalScore || 0) + 1;
    }
    room.sync();
    room.gotoAfterTurn();
  }

  onMsg({
    type,
    room,
    user,
    data,
    ctx,
  }: {
    type: string;
    room: GameRoom;
    user: GameUser;
    data: any;
    ctx?: PhaseCtx;
  }) {
    switch (type) {
      case GomokuCustomMsgTypes.PlaceStone:
        this.onPlaceStone({ room, user, data, ctx });
        break;
      case GomokuCustomMsgTypes.Resign:
        this.onResign({ room, user });
        break;
      case GomokuCustomMsgTypes.Undo:
        this.onUndo({ room, user, ctx });
        break;
      default:
        console.error('Unknown gomoku message type:', type);
    }
  }
}

export default Gomoku;
