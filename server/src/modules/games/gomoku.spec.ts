import Gomoku from './gomoku';
import { GameRoom, GameUser } from '../game.module';
import { GOMOKU_BOARD_SIZE, GomokuCustomMsgTypes } from 'shared/types/games/gomoku';

describe('Gomoku game', () => {
  let game: Gomoku;
  let room: GameRoom;
  let black: GameUser;
  let white: GameUser;

  const idx = (x: number, y: number) => y * GOMOKU_BOARD_SIZE + x;

  beforeEach(() => {
    jest.clearAllMocks();
    black = { id: 'black', totalScore: 0 } as unknown as GameUser;
    white = { id: 'white', totalScore: 0 } as unknown as GameUser;
    room = {
      isGamePlaying: () => true,
      roundStatus: 'ing',
      turnStatus: 'ing',
      turn: 1,
      blackUserId: 'black',
      whiteUserId: 'white',
      currentPlayerId: 'black',
      board: Array.from({ length: GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE }, () => '' as any),
      winnerId: '',
      isDraw: false,
      lastMove: null,
      userOrder: ['black', 'white'],
      users: { black, white },
      register: jest.fn(),
      setVisibility: jest.fn(),
      setRoundResult: jest.fn(),
      shuffleUsers: jest.fn(),
      sync: jest.fn(),
      gotoBeforeTurn: jest.fn(),
      gotoAfterTurn: jest.fn(),
      gotoAfterRound: jest.fn(),
      emitToAll: jest.fn(),
      checkPhase: (ctx?: any, opts: any = {}) => {
        const { sameRound = true, sameTurn = true, turnStatus } = opts;
        if (turnStatus && !turnStatus.includes(room.turnStatus)) return false;
        const base = ctx || { round: room.round, turn: room.turn, turnStatus: room.turnStatus };
        if (sameRound && room.round !== base.round) return false;
        if (sameTurn && (room.round !== base.round || room.turn !== base.turn)) return false;
        return true;
      },
    } as unknown as GameRoom;
    game = new Gomoku({ room });
  });

  it('places stones only for the current player on empty cells', () => {
    // 白方不是当前玩家，拒绝
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: white, data: { x: 7, y: 7 } });
    expect(room.board[idx(7, 7)]).toBe('');
    expect(room.sync).not.toHaveBeenCalled();

    // 黑方正常落子
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: black, data: { x: 7, y: 7 } });
    expect(room.board[idx(7, 7)]).toBe('black');
    expect(room.lastMove).toEqual({ x: 7, y: 7 });
    expect(room.sync).toHaveBeenCalledTimes(1);
    expect(room.gotoAfterTurn).toHaveBeenCalledTimes(1);

    // 已有棋子的格子，拒绝
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: black, data: { x: 7, y: 7 } });
    expect(room.sync).toHaveBeenCalledTimes(1);
  });

  it('rejects stones arriving after the turn moved on', () => {
    const ctx = { round: 1, turn: 1, turnStatus: 'ing' as const };
    room.turn = 2; // 阶段已漂移
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: black, data: { x: 0, y: 0 }, ctx });
    expect(room.board[idx(0, 0)]).toBe('');
    expect(room.sync).not.toHaveBeenCalled();
  });

  it('detects five in a row and scores the winner', () => {
    for (let x = 0; x < 4; x += 1) {
      room.board[idx(x, 7)] = 'black';
    }
    // 轮到白，先让白落一子不构成威胁，再切回黑
    room.currentPlayerId = 'white';
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: white, data: { x: 7, y: 8 } });
    room.currentPlayerId = 'black';
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: black, data: { x: 4, y: 7 } });

    expect(room.winnerId).toBe('black');
    expect((room.users.black as any).totalScore).toBe(1);
  });

  it('alternates players by turn parity in onBeforeTurnStart', () => {
    room.turn = 1;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('black');
    room.turn = 2;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('white');
  });

  it('ends the round on win or draw, otherwise continues to the next turn', () => {
    room.winnerId = 'black';
    game.onAfterTurnEnd({ room });
    expect(room.gotoAfterRound).toHaveBeenCalled();
    expect(room.gotoBeforeTurn).not.toHaveBeenCalled();

    jest.clearAllMocks();
    room.winnerId = '';
    room.isDraw = false;
    game.onAfterTurnEnd({ room });
    expect(room.gotoBeforeTurn).toHaveBeenCalled();
  });

  it('marks a draw when the board is full', () => {
    room.board = room.board.map((_, i) => (i === idx(7, 7) ? '' : 'white') as any);
    // 用对方色隔断中心点四个方向，保证最后一子不构成五连
    const neighbors: [number, number][] = [
      [6, 7], [8, 7], [7, 6], [7, 8], [6, 6], [8, 8], [6, 8], [8, 6],
    ];
    for (const [nx, ny] of neighbors) {
      room.board[idx(nx, ny)] = 'black' as any;
    }
    room.currentPlayerId = 'white';
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: white, data: { x: 7, y: 7 } });
    expect(room.isDraw).toBe(true);
    expect(room.winnerId).toBe('');
  });

  it('lets a player resign, awarding the win to the opponent', () => {
    game.onMsg({ type: GomokuCustomMsgTypes.Resign, room, user: white, data: undefined });
    expect(room.winnerId).toBe('black');
    expect((room.users.black as any).totalScore).toBe(1);
    expect(room.gotoAfterTurn).toHaveBeenCalled();

    // 观战者不能认输
    jest.clearAllMocks();
    room.winnerId = '';
    const spectator = { id: 'guest' } as GameUser;
    game.onMsg({ type: GomokuCustomMsgTypes.Resign, room, user: spectator, data: undefined });
    expect(room.winnerId).toBe('');
    expect(room.sync).not.toHaveBeenCalled();
  });

  it('undoes only the most recent move, once, for its owner', () => {
    room.turn = 1;
    game.onBeforeTurnStart({ room }); // 黑先
    game.onMsg({ type: GomokuCustomMsgTypes.PlaceStone, room, user: black, data: { x: 7, y: 7 } });
    room.turn = 2;
    game.onBeforeTurnStart({ room }); // 轮到白
    room.turnStatus = 'ing';

    // 黑刚落子、已轮到白：白不能悔（最后一手不是白的）
    game.onMsg({ type: GomokuCustomMsgTypes.Undo, room, user: white, data: undefined });
    expect(room.gotoBeforeTurn).not.toHaveBeenCalled();

    // 黑可以悔自己刚落的 (7,7)
    game.onMsg({ type: GomokuCustomMsgTypes.Undo, room, user: black, data: undefined });
    expect(room.board[idx(7, 7)]).toBe('');
    expect(room.lastMove).toBeNull();
    expect(room.lastMoveUserId).toBe('');
    expect(room.gotoBeforeTurn).toHaveBeenCalled();

    // 悔过后不可连续悔（没有更早的历史）：谁都不能再悔
    jest.clearAllMocks();
    game.onMsg({ type: GomokuCustomMsgTypes.Undo, room, user: black, data: undefined });
    game.onMsg({ type: GomokuCustomMsgTypes.Undo, room, user: white, data: undefined });
    expect(room.gotoBeforeTurn).not.toHaveBeenCalled();
  });

  it('rejects undo when there is no move to undo', () => {
    room.lastMove = null;
    room.lastMoveUserId = '';
    game.onMsg({ type: GomokuCustomMsgTypes.Undo, room, user: black, data: undefined });
    expect(room.sync).not.toHaveBeenCalled();
    expect(room.gotoBeforeTurn).not.toHaveBeenCalled();
  });
});
