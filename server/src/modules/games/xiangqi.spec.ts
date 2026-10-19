import Xiangqi from './xiangqi';
import { GameRoom, GameUser } from '../game.module';
import { XiangqiCustomMsgTypes } from 'shared/types/games/xiangqi';

describe('Xiangqi game', () => {
  let game: Xiangqi;
  let room: GameRoom;
  let black: GameUser;
  let white: GameUser;

  const pieceAt = (x: number, y: number) =>
    (room.pieces as any[]).find((p) => p.x === x && p.y === y);

  const click = (user: GameUser, x: number, y: number, ctx?: any) =>
    game.onMsg({ type: XiangqiCustomMsgTypes.Click, room, user, data: { x, y }, ctx });
  const confirm = (user: GameUser, ctx?: any) =>
    game.onMsg({ type: XiangqiCustomMsgTypes.Confirm, room, user, data: undefined, ctx });

  beforeEach(() => {
    jest.clearAllMocks();
    black = { id: 'black', totalScore: 0 } as unknown as GameUser;
    white = { id: 'white', totalScore: 0 } as unknown as GameUser;
    // 摆一个简化局面：各只有将/帅 + 一个车（black 车 at (0,0)，white 车 at (0,9)）
    // 双将不同线，避免任何走子都触发「将帅照面」拦截
    const mk = (x: number, y: number, type: string, color: string, playerId: string) => ({
      x, y, type, color, playerId,
    });
    room = {
      isGamePlaying: () => true,
      roundStatus: 'ing',
      turnStatus: 'ing',
      turn: 1,
      round: 1,
      blackUserId: 'black',
      whiteUserId: 'white',
      currentPlayerId: 'black',
      pieces: [
        mk(4, 0, 'general', 'black', 'black'),
        mk(0, 0, 'rook', 'black', 'black'),
        mk(3, 9, 'general', 'white', 'white'),
        mk(0, 9, 'rook', 'white', 'white'),
      ],
      winnerId: '',
      drafts: {},
      latestMove: null,
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
      emitToUser: jest.fn(),
      checkPhase: (ctx?: any, opts: any = {}) => {
        const { sameRound = true, sameTurn = true, turnStatus } = opts;
        if (turnStatus && !turnStatus.includes(room.turnStatus)) return false;
        const base = ctx || { round: room.round, turn: room.turn, turnStatus: room.turnStatus };
        if (sameRound && room.round !== base.round) return false;
        if (sameTurn && (room.round !== base.round || room.turn !== base.turn)) return false;
        return true;
      },
    } as unknown as GameRoom;
    game = new Xiangqi({ room });
  });

  it('alternates players by turn parity in onBeforeTurnStart', () => {
    room.turn = 1;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('black');
    room.turn = 2;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('white');
  });

  it('only lets the current player select and move', () => {
    click(white, 0, 9); // 不是白方回合
    expect(room.drafts.white).toBeUndefined();
    expect(room.sync).not.toHaveBeenCalled();

    click(black, 0, 9); // 点别人的棋子
    expect(room.drafts.black).toBeUndefined();

    click(black, 0, 0); // 选中自己的车
    expect(room.drafts.black).toMatchObject({ original: { x: 0, y: 0 }, moveKind: 'none' });

    // 点合法落点 (0,5)
    click(black, 0, 5);
    expect(room.drafts.black).toMatchObject({ current: { x: 0, y: 5 }, moveKind: 'move' });

    // 再点同一落点 = 确认
    click(black, 0, 5);
    expect(pieceAt(0, 5)?.type).toBe('rook');
    expect(room.latestMove).toEqual({ x: 0, y: 5 });
    expect(room.drafts.black).toBeNull();
    expect(room.gotoAfterTurn).toHaveBeenCalledTimes(1);
  });

  it('rejects illegal moves and notifies the player', () => {
    click(black, 0, 0);
    click(black, 1, 5); // 车不能斜走
    expect(room.drafts.black).toMatchObject({ moveKind: 'none' });
    expect((room.emitToUser as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect(room.gotoAfterTurn).not.toHaveBeenCalled();
  });

  it('captures the target piece on a confirmed capture', () => {
    // 白车走到 (0,5)，黑车再吃回 (0,5)
    click(white, 0, 9); // 轮到判定：当前 black 先，需切换
    expect(room.drafts.white).toBeUndefined();

    room.turn = 2;
    room.currentPlayerId = 'white';
    click(white, 0, 9);
    click(white, 0, 5);
    confirm(white);
    expect(pieceAt(0, 5)?.color).toBe('white');

    room.turn = 3;
    room.currentPlayerId = 'black';
    click(black, 0, 0);
    click(black, 0, 5);
    confirm(black);
    expect(pieceAt(0, 5)?.color).toBe('black');
    expect(room.pieces.filter((p: any) => p.type === 'rook')).toHaveLength(1);
  });

  it('wins the round by capturing the general', () => {
    // 构造：白将挪到 0 路底（白车让开），黑车 (0,0) 一路吃下去
    ;(room.pieces as any[]).find((p) => p.type === 'general' && p.color === 'white').x = 0;
    ;(room.pieces as any[]).find((p) => p.type === 'rook' && p.color === 'white').x = 8;
    room.turn = 3;
    room.currentPlayerId = 'black';
    click(black, 0, 0);
    click(black, 0, 9);
    confirm(black);
    expect(room.winnerId).toBe('black');
    expect((room.users.black as any).totalScore).toBe(1);
    expect(room.gotoAfterTurn).toHaveBeenCalled();
  });

  it('ends the round on win, otherwise continues', () => {
    room.winnerId = 'black';
    game.onAfterTurnEnd({ room });
    expect(room.gotoAfterRound).toHaveBeenCalled();
    expect(room.gotoBeforeTurn).not.toHaveBeenCalled();

    jest.clearAllMocks();
    room.winnerId = '';
    game.onAfterTurnEnd({ room });
    expect(room.gotoBeforeTurn).toHaveBeenCalled();
  });

  it('lets a player resign, awarding the win to the opponent', () => {
    game.onMsg({ type: XiangqiCustomMsgTypes.Resign, room, user: white, data: undefined });
    expect(room.winnerId).toBe('black');
    expect((room.users.black as any).totalScore).toBe(1);

    // 观战者不能认输
    jest.clearAllMocks();
    room.winnerId = '';
    const spectator = { id: 'guest' } as GameUser;
    game.onMsg({ type: XiangqiCustomMsgTypes.Resign, room, user: spectator, data: undefined });
    expect(room.winnerId).toBe('');
    expect(room.sync).not.toHaveBeenCalled();
  });

  it('reassigns room.pieces on confirm (AutoSyncData only marks dirty on assignment)', () => {
    let assignments = 0;
    const piecesArr = room.pieces;
    Object.defineProperty(room, 'pieces', {
      get: () => piecesArr,
      set: () => {
        assignments += 1;
      },
    });
    click(black, 0, 0);
    click(black, 0, 5);
    confirm(black);
    expect(assignments).toBeGreaterThan(0);
  });

  it('cancels the draft and rejects clicks arriving after the turn moved on', () => {
    click(black, 0, 0);
    game.onMsg({ type: XiangqiCustomMsgTypes.Cancel, room, user: black, data: undefined });
    expect(room.drafts.black).toBeNull();

    jest.clearAllMocks();
    const ctx = { round: 1, turn: 1, turnStatus: 'ing' as const };
    room.turn = 2; // 阶段已漂移
    click(black, 0, 0, ctx);
    expect(room.sync).not.toHaveBeenCalled();
  });

  it('rejects moves that leave the generals facing each other', () => {
    // 白将 (3,9) 横走到 4 路底：走后与黑将 (4,0) 同线无阻挡 → 照面，非法
    room.turn = 2;
    room.currentPlayerId = 'white';
    click(white, 3, 9);
    click(white, 4, 9);
    // 预走不成立，确认也无效
    confirm(white);
    expect(pieceAt(3, 9)?.type).toBe('general');
    expect(room.gotoAfterTurn).not.toHaveBeenCalled();

    // 白将沿 3 路向前一步（不照面）→ 合法
    click(white, 3, 9);
    click(white, 3, 8);
    confirm(white);
    expect(pieceAt(3, 8)?.type).toBe('general');
    expect(room.gotoAfterTurn).toHaveBeenCalled();
  });
});
