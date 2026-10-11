import DrawGuess from './drawguess';
import { GameRoom, GameUser } from '../game.module';

describe('DrawGuess words', () => {
  const aggregate = jest.fn();
  const updateOne = jest.fn();
  let game: DrawGuess;
  let room: GameRoom;
  let drawer: GameUser;

  beforeEach(() => {
    jest.clearAllMocks();
    DrawGuess.registerModels(() => ({ aggregate, updateOne }) as any);
    room = {
      isGamePlaying: () => true,
      roundStatus: 'ing',
      turnStatus: 'before',
      drawerId: 'drawer',
      word: '苹果',
      category: '水果',
      wordLength: 2,
      round: 1,
      turn: 1,
      setVisibility: jest.fn(),
      sync: jest.fn(),
      checkPhase: (ctx?: any, opts: any = {}) => {
        const { sameRound = true, sameTurn = true, turnStatus } = opts;
        if (turnStatus && !turnStatus.includes(room.turnStatus)) return false;
        const base = ctx || { round: room.round, turn: room.turn, turnStatus: room.turnStatus };
        if (sameRound && room.round !== base.round) return false;
        if (sameTurn && (room.round !== base.round || room.turn !== base.turn)) return false;
        return true;
      },
    } as unknown as GameRoom;
    drawer = { id: 'drawer' } as GameUser;
    game = new DrawGuess({ room });
  });

  afterEach(() => jest.restoreAllMocks());

  it('uses change counts as weights and excludes words at zero probability', async () => {
    aggregate.mockResolvedValue([
      { name: '猫', category: '动物', changeCount: 9 },
      { name: '狗', category: '动物', changeCount: 0 },
    ]);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await expect(game.pickWord('苹果')).resolves.toMatchObject({ name: '狗' });
    expect(aggregate.mock.calls[0][0][0].$match).toEqual({
      $or: [{ changeCount: { $lt: 10 } }, { changeCount: { $exists: false } }],
      name: { $ne: '苹果' },
    });
  });

  it('never selects a candidate whose chance has reached zero', async () => {
    aggregate.mockResolvedValue([
      { name: '猫', category: '动物', changeCount: 10 },
      { name: '狗', category: '动物', changeCount: 0 },
    ]);
    jest.spyOn(Math, 'random').mockReturnValue(0);

    await expect(game.pickWord()).resolves.toMatchObject({ name: '狗' });
  });

  it('only lets the current drawer replace a pre-turn word and records one change', async () => {
    aggregate.mockResolvedValue([{ name: '猫', category: '动物', changeCount: 0 }]);
    updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) });

    await game.onChangeWord({ room, user: { id: 'guest' } as GameUser });
    expect(aggregate).not.toHaveBeenCalled();
    await game.onChangeWord({ room, user: drawer });
    expect(updateOne).toHaveBeenCalledWith(
      { name: '苹果' }, { $inc: { changeCount: 1 } },
    );
    expect(room.word).toBe('猫');
    expect(room.category).toBe('动物');
    expect(room.sync).toHaveBeenCalledTimes(1);

    room.turnStatus = 'ing';
    await game.onChangeWord({ room, user: drawer });
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('ignores concurrent change requests', async () => {
    let finishSelection: (value: any[]) => void;
    aggregate.mockReturnValue(new Promise((resolve) => { finishSelection = resolve; }));
    updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });

    const first = game.onChangeWord({ room, user: drawer });
    await game.onChangeWord({ room, user: drawer });
    expect(aggregate).toHaveBeenCalledTimes(1);
    finishSelection!([{ name: '猫', category: '动物', changeCount: 0 }]);
    await first;
    expect(updateOne).toHaveBeenCalledTimes(1);
  });

  it('drops a change-word request whose phase drifted during the async pick', async () => {
    // ctx 是消息分发时的阶段快照（本 turn 的 before）；选词异步期间回合已推进
    const ctx = { round: 1, turn: 1, turnStatus: 'before' as const };
    let finishSelection: (value: any[]) => void;
    aggregate.mockReturnValue(new Promise((resolve) => { finishSelection = resolve; }));
    updateOne.mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });

    const pending = game.onChangeWord({ room, user: drawer, ctx });
    room.turn = 2; // 阶段漂移
    finishSelection!([{ name: '猫', category: '动物', changeCount: 0 }]);
    await pending;

    expect(room.word).toBe('苹果');
    expect(room.sync).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('drops strokes and guesses that arrive outside the drawing phase', () => {
    room.turnStatus = 'after';
    game.onDrawStroke({ room, user: drawer, data: [{ id: 1 }] as any });
    game.onClearCanvas({ room, user: drawer });
    expect(room.sync).not.toHaveBeenCalled();

    expect(
      game.onMessageBefore({ room, user: { id: 'guest' } as GameUser, text: '苹果' }),
    ).toBeUndefined();
  });

  it('accumulates reactions from anyone except the drawer, with throttled sync', () => {
    jest.useFakeTimers();
    try {
      room.turnStatus = 'after';
      room.likes = 0;
      room.dislikes = 0;
      const guest = { id: 'guest' } as GameUser;

      // drawer 自己不能投
      game.onReaction({ room, user: drawer, value: 'like' });
      expect(room.likes).toBe(0);

      // 任意玩家可累加（不看身份、无上限）
      game.onReaction({ room, user: guest, value: 'like' });
      game.onReaction({ room, user: guest, value: 'like' });
      game.onReaction({ room, user: drawer, value: 'dislike' });
      game.onReaction({ room, user: guest, value: 'dislike' });
      expect(room.likes).toBe(2);
      expect(room.dislikes).toBe(1);

      // 高频点击期间 sync 被节流合并（200ms trailing）
      expect(room.sync).not.toHaveBeenCalled();
      jest.advanceTimersByTime(200);
      expect(room.sync).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});