import Checkers from './checkers';
import { GameRoom, GameUser } from '../game.module';
import { CheckersCustomMsgTypes } from 'shared/types/games/checkers';

describe('Checkers game', () => {
  let game: Checkers;
  let room: GameRoom;
  let a: GameUser;
  let b: GameUser;

  const pieceAt = (q: number, r: number) =>
    (room.pieces as any[]).find((p) => p.q === q && p.r === r);

  const click = (user: GameUser, q: number, r: number, ctx?: any) =>
    game.onMsg({ type: CheckersCustomMsgTypes.Click, room, user, data: { q, r }, ctx });
  const confirm = (user: GameUser, ctx?: any) =>
    game.onMsg({ type: CheckersCustomMsgTypes.Confirm, room, user, data: undefined, ctx });

  const mk = (q: number, r: number, color: string, playerId: string) => ({ q, r, color, playerId });

  beforeEach(() => {
    jest.clearAllMocks();
    a = { id: 'a', totalScore: 0 } as unknown as GameUser;
    b = { id: 'b', totalScore: 0 } as unknown as GameUser;
    room = {
      isGamePlaying: () => true,
      roundStatus: 'ing',
      turnStatus: 'ing',
      turn: 1,
      round: 1,
      playerIds: ['a', 'b'],
      playerCount: 2,
      currentPlayerId: 'a',
      pieces: [mk(0, 0, 'yellow', 'a'), mk(0, 1, 'blue', 'b')],
      winnerId: '',
      drafts: {},
      targetZones: { a: 3, b: 0 },
      latestMove: null,
      userOrder: ['a', 'b'],
      users: { a, b },
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
    game = new Checkers({ room });
  });

  it('rotates players by playerIds in onBeforeTurnStart', () => {
    room.turn = 1;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('a');
    room.turn = 2;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('b');
    room.turn = 3;
    game.onBeforeTurnStart({ room });
    expect(room.currentPlayerId).toBe('a');
  });

  it('only lets the current player select and move', () => {
    click(b, 0, 1); // 不是 b 的回合
    expect(room.drafts.b).toBeUndefined();

    click(a, 0, 1); // 点别人的棋子
    expect(room.drafts.a).toBeUndefined();

    click(a, 0, 0); // 选中
    expect(room.drafts.a).toMatchObject({ original: { q: 0, r: 0 }, moveKind: 'none' });

    // 相邻步到 (1,0)
    click(a, 1, 0);
    expect(room.drafts.a).toMatchObject({ current: { q: 1, r: 0 }, moveKind: 'step' });

    // 再点同一落点 = 确认
    click(a, 1, 0);
    expect(pieceAt(1, 0)?.color).toBe('yellow');
    expect(room.latestMove).toEqual({ q: 1, r: 0 });
    expect(room.drafts.a).toBeNull();
    expect(room.gotoAfterTurn).toHaveBeenCalledTimes(1);
  });

  it('jumps over a line of pieces and forbids mixing step/jump', () => {
    // b 在 (0,1)，a 从 (0,0) 沿 (0,1) 方向连跳到 (0,2)
    click(a, 0, 0);
    click(a, 0, 2);
    expect(room.drafts.a).toMatchObject({ current: { q: 0, r: 2 }, moveKind: 'jump' });

    // 跳后不能普通移动
    click(a, 0, 3);
    expect(room.drafts.a).toMatchObject({ current: { q: 0, r: 2 }, moveKind: 'jump' });
    expect((room.emitToUser as jest.Mock).mock.calls.length).toBeGreaterThan(0);

    // 确认跳
    confirm(a);
    expect(pieceAt(0, 2)?.color).toBe('yellow');
    expect(pieceAt(0, 0)).toBeUndefined();

    // 普通步后不能继续走
    jest.clearAllMocks();
    room.turn = 3;
    room.currentPlayerId = 'a';
    room.pieces = [mk(4, 0, 'yellow', 'a'), mk(0, 1, 'blue', 'b')];
    click(a, 4, 0);
    click(a, 4, 1); // step
    click(a, 4, 2); // step 后续走 → 拒绝
    expect(room.drafts.a).toMatchObject({ moveKind: 'step' });
  });

  it('rejects unreachable jump targets and occupied cells', () => {
    click(a, 0, 0);
    click(a, 5, 5); // 中间无连续棋子可跳
    expect(room.drafts.a).toMatchObject({ moveKind: 'none' });
    click(a, 0, 1); // 有棋子
    expect(room.drafts.a).toMatchObject({ moveKind: 'none' });
    expect(room.gotoAfterTurn).not.toHaveBeenCalled();
  });

  it('wins the round when all 10 pieces reach the target zone', () => {
    // 目标区 3（下三角 r=5..8）：放 9 子在区内，最后一个 (0,4) 一步走进 (-1,5)
    const zone3: Array<{ q: number; r: number }> = [];
    for (let r = 5; r <= 8; r++) {
      for (let q = -4; q <= 4 - r; q++) {
        zone3.push({ q, r });
      }
    }
    const nine = zone3.filter((pos) => !(pos.q === -1 && pos.r === 5));
    room.pieces = [
      ...nine.map((pos) => mk(pos.q, pos.r, 'yellow', 'a')),
      mk(0, 4, 'yellow', 'a'),
      mk(0, 1, 'blue', 'b'),
    ];
    click(a, 0, 4);
    click(a, -1, 5); // 相邻步
    confirm(a);
    expect(room.winnerId).toBe('a');
    expect((room.users.a as any).totalScore).toBe(1);
    expect(room.gotoAfterTurn).toHaveBeenCalled();
  });

  it('cancels the draft and rejects stale-phase clicks', () => {
    click(a, 0, 0);
    game.onMsg({ type: CheckersCustomMsgTypes.Cancel, room, user: a, data: undefined });
    expect(room.drafts.a).toBeNull();

    jest.clearAllMocks();
    const ctx = { round: 1, turn: 1, turnStatus: 'ing' as const };
    room.turn = 2;
    click(a, 0, 0, ctx);
    expect(room.sync).not.toHaveBeenCalled();
  });

  it('reassigns room.pieces on confirm (AutoSyncData dirty contract)', () => {
    let assignments = 0;
    const piecesArr = room.pieces;
    Object.defineProperty(room, 'pieces', {
      get: () => piecesArr,
      set: () => {
        assignments += 1;
      },
    });
    click(a, 0, 0);
    click(a, 1, 0);
    confirm(a);
    expect(assignments).toBeGreaterThan(0);
  });
});
