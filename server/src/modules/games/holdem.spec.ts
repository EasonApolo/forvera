import Holdem from './holdem';
import { GameRoom, GameUser } from '../game.module';
import { HoldemMsgTypes, HoldemNoticeEvent, HoldemCard } from 'shared/types/games/holdem';

describe('Holdem game', () => {
  let gateway: { emitToUser: jest.Mock };
  let room: GameRoom;
  let a: GameUser;
  let b: GameUser;

  const mkCard = (rank: HoldemCard['rank'], suit: HoldemCard['suit']): HoldemCard => ({
    rank,
    suit,
    isFacedown: false,
  });

  const msg = (type: string, user: GameUser, data?: any) =>
    (room.game as Holdem).onMsg({ type, room, user, data, ctx: room.phaseCtx() });

  const addChip = (user: GameUser, chipValue: number) =>
    msg(HoldemMsgTypes.AddChip, user, { chipValue });
  const confirm = (user: GameUser) => msg(HoldemMsgTypes.ConfirmBet, user, undefined);
  const quitBet = (user: GameUser) => msg(HoldemMsgTypes.QuitBet, user, undefined);
  const allIn = (user: GameUser) => msg(HoldemMsgTypes.AllIn, user, undefined);

  const chipValueSum = (user: GameUser) =>
    (user.chips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0);
  const betValueSum = (user: GameUser) =>
    (user.betChips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0);

  /** 最近一次发给某客户端的 syncRoom 数据（真实同步链路，含 visibility 处理） */
  const lastSyncFor = (clientId: string): any => {
    const calls = gateway.emitToUser.mock.calls.filter(
      (c) => c[0].clientId === clientId && c[0].event === 'syncRoom',
    );
    return calls.at(-1)?.[0].payload.data;
  };
  const firstSyncFor = (clientId: string): any => {
    const calls = gateway.emitToUser.mock.calls.filter(
      (c) => c[0].clientId === clientId && c[0].event === 'syncRoom',
    );
    return calls[0]?.[0].payload.data;
  };

  /** 跳过「翻公共牌」的 5 秒停顿（等价框架定时器到点） */
  const skipDealingPause = () => {
    room.clearTimer(); // 清掉 pending 的停顿定时器，避免测试进程挂起
    room.game?.onAfterTurnEnd?.({ room });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = { emitToUser: jest.fn() };
    room = new GameRoom(gateway as any, 'holdem');
    a = room.addUser({ userId: 'a', clientId: 'ca' });
    b = room.addUser({ userId: 'b', clientId: 'cb' });
    a.name = 'A';
    b.name = 'B';
    room.startGame();
  });

  it('deals cards with private visibility: others receive null, self receives real cards', () => {
    const forA = lastSyncFor('ca');
    expect(forA.users.a.cards).toHaveLength(2);
    expect(forA.users.b.cards).toBeNull();
    expect(forA.communityCards).toHaveLength(5);
    expect(forA.communityCards.every((c: HoldemCard) => c.isFacedown)).toBe(true);

    const forB = lastSyncFor('cb');
    expect(forB.users.b.cards).toHaveLength(2);
    expect(forB.users.a.cards).toBeNull();
  });

  it('rotates blinds each round: first SB=seat[0]/BB=seat[1], then old BB becomes SB', () => {
    expect(a.isSmallBlind).toBe(true);
    expect(b.isBigBlind).toBe(true);
    expect(room.currentPlayerId).toBe('a'); // 小盲先行动

    (room.game as Holdem).onBeforeRoundStart({ room });
    expect(b.isSmallBlind).toBe(true); // 旧大盲变小盲
    expect(a.isBigBlind).toBe(true); // 大盲下家（座位循环）变大盲
    expect(room.currentPlayerId).toBe('b');
  });

  it('plays a betting round to the flop with dealing pause', () => {
    // SB(a) 下 5 加注
    addChip(a, 5);
    confirm(a);
    expect(room.currentPlayerId).toBe('b');

    // BB(b) 下 10 加注
    addChip(b, 10);
    confirm(b);
    expect(room.currentPlayerId).toBe('a');

    // a 补齐跟注
    addChip(a, 5);
    confirm(a);
    // 一条街下完 → 翻牌 + 停顿
    expect(room.gamePhase).toBe('flop');
    expect(room.turnStatus).toBe('after');
    expect(room.currentPlayerId).toBe('');
    expect(room.communityCards.slice(0, 3).every((c) => !c.isFacedown)).toBe(true);
    expect(room.communityCards.slice(3).every((c) => c.isFacedown)).toBe(true);

    skipDealingPause();
    expect(room.turnStatus).toBe('ing');
    expect(a.isAsked).toBe(false);
    expect(b.isAsked).toBe(false);
    expect(room.currentPlayerId).toBe('a'); // 小盲起头
  });

  it('finishes the hand when all but one fold (win pre), settling chips', () => {
    addChip(a, 5);
    confirm(a);
    addChip(b, 10);
    confirm(b);
    addChip(a, 5);
    confirm(a); // → flop + pause

    skipDealingPause();
    const bChipsBefore = chipValueSum(b); // 已投入 10（490）
    quitBet(a); // a 弃牌 → b 直接获胜
    expect(room.gamePhase).toBe('showdown');
    expect(room.winnerIds).toEqual(['b']);
    expect(room.roundStatus).toBe('after');
    // 赢家拿走全部下注（b 自己的 10 + a 的 10）
    expect(chipValueSum(b)).toBe(bChipsBefore + 20);
    const result = room.roundResults[0].users;
    expect(result.b.isWinner).toBe(true);
    expect(result.a.profit).toBe(-10);
    expect(result.b.profit).toBe(10); // 赢走 a 的 10
    expect(result.b.handRank).toBe('无牌型（对手弃牌）');
    // 未摊牌：没有亮任何手牌
    expect(Object.keys(room.revealedCards)).toHaveLength(0);
  });

  it('goes to all-in showdown: reveals community + all hole cards, evaluates hands', () => {
    addChip(a, 5);
    confirm(a);
    expect(room.currentPlayerId).toBe('b');

    allIn(b); // 大盲梭哈
    confirm(b);
    expect(room.currentPlayerId).toBe('a');

    allIn(a); // 跟全押
    confirm(a);
    expect(room.gamePhase).toBe('showdown');
    expect(room.communityCards.every((c) => !c.isFacedown)).toBe(true);
    // all-in 摊牌所有人亮牌（含已弃牌者，与旧版一致）
    expect(room.revealedCards.a).toHaveLength(2);
    expect(room.revealedCards.b).toHaveLength(2);
    expect(room.winnerIds.length).toBeGreaterThanOrEqual(1);
    expect(room.roundResults[0].users[room.winnerIds[0]].isWinner).toBe(true);
  });

  it('marks chips/betChips dirty on chip moves and keeps hole cards hidden', () => {
    const initialForA = firstSyncFor('ca'); // 开局的全量 sync（mockClear 之前抓）
    gateway.emitToUser.mockClear();
    addChip(a, 5); // 内部 room.sync()
    const forB = lastSyncFor('cb');
    expect(forB.users.a.chips).toBeDefined();
    expect(forB.users.a.betChips).toBeDefined();
    // 手牌未变动时不下发任何内容（客户端保留初始 syncAll 时的 null）
    expect(forB.users.a.cards).toBeFalsy();
    // 自己的增量 sync 带最新筹码，初始全量 sync 带真实手牌
    const forA = lastSyncFor('ca');
    expect(forA.users.a.betChips).toBeDefined();
    expect(initialForA.users.a.cards).toHaveLength(2);
  });

  it('call moves exact chips but still needs a manual confirm (跟注)', () => {
    addChip(a, 5);
    confirm(a); // a → 5
    addChip(b, 20);
    confirm(b); // b 加注到 20
    expect(room.currentPlayerId).toBe('a');

    msg(HoldemMsgTypes.Call, a, undefined); // a 一键跟注 15（5+10 精确凑出），只移动筹码
    expect(betValueSum(a)).toBe(20);
    expect(a.isAsked).toBe(false); // 未代点确认
    expect(room.currentPlayerId).toBe('a'); // 仍轮到 a

    confirm(a); // 手动确认后一条街下完，进入翻牌停顿
    expect(room.gamePhase).toBe('flop');
    expect(room.turnStatus).toBe('after');
    skipDealingPause();
    expect(room.currentPlayerId).toBe('a'); // 小盲起头
  });

  it('call with insufficient chips is rejected with a notice (筹码不足)', () => {
    addChip(a, 5);
    confirm(a); // a → 5，手里剩 495
    allIn(b);
    confirm(b); // b 全押 500，a 需跟 495
    expect(room.currentPlayerId).toBe('a');

    // 把 a 的筹码换成小面值也凑不够：手里只有 5+5
    a.chips = [
      { value: 5, count: 2 },
    ];
    msg(HoldemMsgTypes.Call, a, undefined);
    expect(a.isAllIn).toBe(false);
    expect(betValueSum(a)).toBe(5); // 筹码未动
    expect(room.currentPlayerId).toBe('a'); // 仍轮到 a
    const notices = gateway.emitToUser.mock.calls.filter(
      (call) => call[0].event === HoldemNoticeEvent,
    );
    expect(notices.at(-1)?.[0].payload.data.message).toBe('筹码不足');
  });

  it('enforces small-blind opening cap (小盲首开不能超过大盲)', () => {
    addChip(a, 5);
    addChip(a, 5); // 累计 10，仍合法
    addChip(a, 10); // 累计 20 > 10 → 拒绝 + 私发提示
    const noticeCalls = gateway.emitToUser.mock.calls.filter(
      (call) => call[0].event === HoldemNoticeEvent,
    );
    expect(noticeCalls.length).toBe(1);
    expect(betValueSum(a)).toBe(10);

    // 确认路径同样拦截（梭哈后确认会被拒）
    allIn(a);
    confirm(a);
    expect(room.currentPlayerId).toBe('a'); // 仍轮到 a
    const notices = gateway.emitToUser.mock.calls.filter(
      (call) => call[0].event === HoldemNoticeEvent,
    );
    expect(notices.at(-1)?.[0].payload.data.message).toBe('小盲第一次下注总额不能超过10');
  });

  it('lets a mid-game joiner watch but not participate until next round', () => {    const c = room.addUser({ userId: 'c', clientId: 'cc' });
    expect(room.playerIds).not.toContain('c');
    expect(c.chips).toBeDefined(); // 已初始化（可进银行）
    // 不影响下注轮转
    addChip(a, 5);
    confirm(a);
    expect(room.currentPlayerId).toBe('b');
    // c 不能替人行动
    msg(HoldemMsgTypes.ConfirmBet, c, undefined);
    expect(room.currentPlayerId).toBe('b');
  });

  it('guards bank operations and tracks bank balance', () => {
    msg(HoldemMsgTypes.Loan, a, undefined); // 开局 500 > 100 → 拒绝
    msg(HoldemMsgTypes.Repay, a, undefined); // < 800 → 拒绝
    const notices = gateway.emitToUser.mock.calls.filter(
      (call) => call[0].event === HoldemNoticeEvent,
    );
    expect(notices.length).toBe(2);
    expect(chipValueSum(a)).toBe(500); // 未变化
    expect(a.bankBalance).toBe(0);

    // 筹码见底后贷款：银行欠款 -500
    a.chips = [{ value: 5, count: 2 }];
    msg(HoldemMsgTypes.Loan, a, undefined);
    expect(chipValueSum(a)).toBe(510);
    expect(a.bankBalance).toBe(-500);

    // 赢到 1000 后还款：欠款对冲为 0
    a.chips = [{ value: 100, count: 10 }];
    msg(HoldemMsgTypes.Repay, a, undefined);
    expect(chipValueSum(a)).toBe(500);
    expect(a.bankBalance).toBe(0);

    // 无欠款再还款：记为存款 +500
    a.chips = [{ value: 100, count: 10 }];
    msg(HoldemMsgTypes.Repay, a, undefined);
    expect(chipValueSum(a)).toBe(500);
    expect(a.bankBalance).toBe(500);

    // 纯 200 面值凑不出精确 500 → 拒绝并提示找零（账实一致，不部分扣款）
    const beforeBalance = a.bankBalance;
    a.chips = [{ value: 200, count: 5 }];
    msg(HoldemMsgTypes.Repay, a, undefined);
    expect(chipValueSum(a)).toBe(1000);
    expect(a.bankBalance).toBe(beforeBalance);
    const lastNotice = gateway.emitToUser.mock.calls
      .filter((call) => call[0].event === HoldemNoticeEvent)
      .at(-1)?.[0].payload.data.message;
    expect(lastNotice).toBe('筹码无法精确凑出500，请先找零');
  });

  describe('evaluateWin', () => {
    const mkUser = (id: string, cards: HoldemCard[]) => {
      const user = new GameUser(id, 'c');
      user.register('cards', 'private');
      user.cards = cards;
      return user;
    };

    it('higher pair wins', () => {
      const game = room.game as Holdem;
      const community = [
        mkCard('2', 'spades'),
        mkCard('7', 'diamonds'),
        mkCard('9', 'clubs'),
        mkCard('J', 'hearts'),
        mkCard('3', 'diamonds'),
      ];
      const pairAces = mkUser('u1', [mkCard('A', 'spades'), mkCard('A', 'hearts')]);
      const pairKings = mkUser('u2', [mkCard('K', 'diamonds'), mkCard('K', 'clubs')]);
      const result = game.evaluateWin([pairAces, pairKings], community)!;
      expect(result.users.map((u) => u.id)).toEqual(['u1']);
      expect(result.handRanks.u1).toBe('一对');
      expect(result.handRanks.u2).toBe('一对');
    });

    it('board straight ties both players', () => {
      const game = room.game as Holdem;
      const community = [
        mkCard('5', 'spades'),
        mkCard('6', 'diamonds'),
        mkCard('7', 'clubs'),
        mkCard('8', 'hearts'),
        mkCard('9', 'diamonds'),
      ];
      const aceLow = mkUser('u1', [mkCard('A', 'spades'), mkCard('2', 'spades')]);
      const pairKings = mkUser('u2', [mkCard('K', 'spades'), mkCard('K', 'hearts')]);
      const result = game.evaluateWin([aceLow, pairKings], community)!;
      expect(result.users).toHaveLength(2);
      expect(result.handRanks.u1).toBe('顺子');
      expect(result.handRanks.u2).toBe('顺子');
    });

    it('flush beats straight', () => {
      const game = room.game as Holdem;
      const community = [
        mkCard('2', 'spades'),
        mkCard('5', 'spades'),
        mkCard('6', 'spades'),
        mkCard('7', 'hearts'),
        mkCard('8', 'hearts'),
      ];
      const flushUser = mkUser('u1', [mkCard('K', 'spades'), mkCard('3', 'spades')]);
      const straightUser = mkUser('u2', [mkCard('4', 'hearts'), mkCard('9', 'diamonds')]);
      const result = game.evaluateWin([flushUser, straightUser], community)!;
      expect(result.users.map((u) => u.id)).toEqual(['u1']);
      expect(result.handRanks.u1).toBe('同花');
      expect(result.handRanks.u2).toBe('顺子');
    });

    it('excludes folded users', () => {
      const game = room.game as Holdem;
      const community = [
        mkCard('2', 'spades'),
        mkCard('7', 'diamonds'),
        mkCard('9', 'clubs'),
        mkCard('J', 'hearts'),
        mkCard('3', 'diamonds'),
      ];
      const folded = mkUser('u1', [mkCard('A', 'spades'), mkCard('A', 'hearts')]);
      folded.isQuitBet = true;
      const pairKings = mkUser('u2', [mkCard('K', 'diamonds'), mkCard('K', 'clubs')]);
      const result = game.evaluateWin([folded, pairKings], community)!;
      expect(result.users.map((u) => u.id)).toEqual(['u2']);
      expect(result.handRanks.u1).toBeUndefined();
    });
  });
});
