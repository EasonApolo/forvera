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
      turn: 1,
      setVisibility: jest.fn(),
      sync: jest.fn(),
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
});