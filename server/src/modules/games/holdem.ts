import { Game, GameRoom, GameUser } from '../game.module';
import { PhaseCtx } from 'shared/types/game';
import {
  HoldemCard,
  HoldemChip,
  HoldemMsgTypes,
  HoldemNoticeEvent,
  HoldemUserActionEvent,
  HoldemBlinds,
  HoldemDealingDuration,
} from 'shared/types/games/holdem';

// ==================== 牌/筹码工具（平移自旧 holdem.module） ====================

const rankValueMap: Record<HoldemCard['rank'], number> = {
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

function generateDeck(): HoldemCard[] {
  const ranks = Object.keys(rankValueMap) as HoldemCard['rank'][];
  const suits: HoldemCard['suit'][] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const deck: HoldemCard[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit, isFacedown: false });
    }
  }
  return deck;
}

function shuffleDeck(deck: HoldemCard[]): HoldemCard[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 初始筹码堆
function initializeChips(): HoldemChip[] {
  return [
    { value: 5, count: 4 },
    { value: 10, count: 5 },
    { value: 20, count: 4 },
    { value: 50, count: 1 },
    { value: 100, count: 1 },
    { value: 200, count: 1 },
  ];
}

function sortChips(chips: HoldemChip[]): HoldemChip[] {
  return [...chips].sort((a, b) => a.value - b.value);
}

// ==================== 游戏 ====================

class Holdem implements Game {
  room: GameRoom;

  constructor({ room }: { room: GameRoom }) {
    this.room = room;
  }

  // ---------- 字段注册与初始化 ----------

  private registerUserFields(user: GameUser) {
    // ⚠️ visibility 关键：手牌是 private —— 只有本人能同步到内容，其他人收到 null。
    // 摊牌亮牌走房间公共字段 revealedCards，不能为了省事把手牌设成 public。
    user.register('chips', 'public');
    user.register('betChips', 'public');
    user.register('cards', 'private');
    user.register('betSum', 'public');
    user.register('isAsked', 'public');
    user.register('isQuitBet', 'public');
    user.register('isAllIn', 'public');
    user.register('isSmallBlind', 'public');
    user.register('isBigBlind', 'public');
    user.register('bankBalance', 'public');
  }

  /** 重置一整局游戏的玩家状态（开局/重启时用，等价旧版 resetRoomToWaiting + 初始状态） */
  private initUserState(user: GameUser) {
    user.chips = initializeChips();
    user.betChips = [];
    user.cards = [];
    user.betSum = 0;
    user.isAsked = false;
    user.isQuitBet = false;
    user.isAllIn = false;
    user.isSmallBlind = false;
    user.isBigBlind = false;
    user.bankBalance = 0;
    user.readyStatus = null;
  }

  onStartGame({ room }: { room: GameRoom }) {
    room.register('playerIds', 'public');
    room.register('currentPlayerId', 'public');
    room.register('communityCards', 'public');
    room.register('gamePhase', 'public');
    room.register('winnerIds', 'public');
    room.register('revealedCards', 'public');

    room.playerIds = [];
    room.currentPlayerId = '';
    room.communityCards = [];
    room.gamePhase = 'waiting';
    room.winnerIds = [];
    room.revealedCards = {};

    Object.values(room.users).forEach((user) => {
      this.registerUserFields(user);
      this.initUserState(user);
    });
  }

  onUserJoin({ room, user }: { room: GameRoom; user: GameUser }) {
    // 中局加入：初始化状态但本局不入座（不在 playerIds），下局自动入座 —— 对应旧版 pendingUsers
    this.registerUserFields(user);
    this.initUserState(user);
  }

  // ---------- 一局（一手牌） ----------

  onBeforeRoundStart({ room }: { room: GameRoom }) {
    const prevSeat = [...(room.playerIds || [])];
    const prevBigBlindId = prevSeat.find((id) => room.users[id]?.isBigBlind);

    const seat = [...room.userOrder];
    room.playerIds = seat;

    // 盲注轮换：旧逻辑为大盲变小盲、大盲下家变大盲；第一局直接座位 0/1
    let smallBlindIndex = 0;
    let bigBlindIndex = 1;
    if (prevBigBlindId && seat.includes(prevBigBlindId)) {
      smallBlindIndex = seat.indexOf(prevBigBlindId);
      bigBlindIndex = (smallBlindIndex + 1) % seat.length;
    }

    Object.values(room.users).forEach((user) => {
      user.betChips = [];
      user.cards = [];
      user.betSum = 0;
      user.isAsked = false;
      user.isQuitBet = false;
      user.isAllIn = false;
      user.isSmallBlind = false;
      user.isBigBlind = false;
      user.readyStatus = null;
    });
    room.users[seat[smallBlindIndex]].isSmallBlind = true;
    room.users[seat[bigBlindIndex]].isBigBlind = true;

    room.gamePhase = 'preflop';
    room.winnerIds = [];
    room.revealedCards = {};

    // 发牌：每人 2 张手牌（private 同步）+ 5 张盖着的公共牌
    const deck = shuffleDeck(generateDeck());
    let cardIndex = 0;
    seat.forEach((userId) => {
      room.users[userId].cards = [
        { ...deck[cardIndex++], isFacedown: false },
        { ...deck[cardIndex++], isFacedown: false },
      ];
    });
    room.communityCards = [0, 1, 2, 3, 4].map(() => ({
      ...deck[cardIndex++],
      isFacedown: true,
    }));

    room.currentPlayerId = seat[smallBlindIndex];
    return { skip: true };
  }

  onBeforeTurnStart({ room }: { room: GameRoom }) {
    return { skip: true };
  }

  /** 下注不限时（与旧版一致），等当前玩家行动 */
  onIngTurnStart({ room }: { room: GameRoom }) {
    return {};
  }

  /**
   * turn（一次下注动作）结束时的分流：
   * - advance-street：一条街下完且还有下一条街 —— 此时翻开新的公共牌并停顿片刻（对应旧版 setTimeout 5s）
   * - 其余情况直接快进，具体处理在 onAfterTurnEnd
   */
  onAfterTurnStart({ room }: { room: GameRoom }) {
    if (this.getTransition(room) === 'advance-street') {
      if (room.gamePhase === 'preflop') {
        room.gamePhase = 'flop';
        room.communityCards = room.communityCards.map((card, index) =>
          index < 3 ? { ...card, isFacedown: false } : card,
        );
      } else if (room.gamePhase === 'flop') {
        room.gamePhase = 'turn';
        room.communityCards = room.communityCards.map((card, index) =>
          index === 3 ? { ...card, isFacedown: false } : card,
        );
      } else if (room.gamePhase === 'turn') {
        room.gamePhase = 'river';
        room.communityCards = room.communityCards.map((card, index) =>
          index === 4 ? { ...card, isFacedown: false } : card,
        );
      }
      room.currentPlayerId = '';
      return { duration: HoldemDealingDuration };
    }
    return { skip: true };
  }

  onAfterTurnEnd({ room }: { room: GameRoom }) {
    const transition = this.getTransition(room);
    if (transition === 'finish') {
      this.finishHand(room);
      room.gotoAfterRound();
      return;
    }
    if (transition === 'advance-street') {
      // 停顿结束，开始下一条街的下注（isAsked 清零，从小盲起重新轮询）
      this.playerUsers(room).forEach((user) => {
        user.isAsked = false;
      });
      room.currentPlayerId = this.getNextPlayerId(room);
      room.gotoBeforeTurn();
      return;
    }
    // 一条街内继续：轮到下一个要行动的玩家
    room.currentPlayerId = this.getNextPlayerId(room);
    room.gotoBeforeTurn();
  }

  // ---------- 下注工具 ----------

  private playerUsers(room: GameRoom): GameUser[] {
    return (room.playerIds || [])
      .map((id) => room.users[id])
      .filter(Boolean);
  }

  private getUserBetSum(user: GameUser): number {
    return (user.betChips || []).reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
  }

  private getMaxBet(room: GameRoom, excludeUserId?: string): number {
    let maxBet = 0;
    for (const user of this.playerUsers(room)) {
      if (excludeUserId && user.id === excludeUserId) continue;
      const betSum = this.getUserBetSum(user);
      if (betSum > maxBet) maxBet = betSum;
    }
    return maxBet;
  }

  /**
   * 获得下一个位置的玩家 index，不考虑弃牌等情况，纯粹下一个 index。
   * 没有给定 index 也没有当前玩家时（一条街的开始），给小盲位置。
   */
  private getNextPlayerIndex(room: GameRoom, index?: number): number {
    const players = this.playerUsers(room);
    if (index === undefined && room.currentPlayerId === '') {
      return players.findIndex((u) => u.isSmallBlind);
    }
    if (index === undefined) {
      index = players.findIndex((u) => u.id === room.currentPlayerId);
    }
    return (index + 1) % players.length;
  }

  /** 获得下一个要行动的玩家 id：跳过已轮询/弃牌/全押/断线的玩家 */
  private getNextPlayerId(room: GameRoom): string {
    let nextPlayerIndex = this.getNextPlayerIndex(room);
    const players = this.playerUsers(room);
    while (true) {
      if (players[nextPlayerIndex]?.isAsked) return '';
      const shouldSkipThis =
        players[nextPlayerIndex]?.isQuitBet ||
        players[nextPlayerIndex]?.isAllIn ||
        players[nextPlayerIndex]?.connectStatus === 'disconnected';
      if (shouldSkipThis) {
        nextPlayerIndex = this.getNextPlayerIndex(room, nextPlayerIndex);
        continue;
      }
      return players[nextPlayerIndex].id;
    }
  }

  /** 一条街是否下完：所有未弃牌/未全押/在线玩家下注额一致且都已行动 */
  private stopBet(room: GameRoom): boolean {
    const activeUsers = this.playerUsers(room).filter(
      (u) => !u.isQuitBet && !u.isAllIn && u.connectStatus !== 'disconnected',
    );
    if (activeUsers.length === 0) return true;
    const betSum = this.getUserBetSum(activeUsers[0]);
    return activeUsers.every(
      (u) => this.getUserBetSum(u) === betSum && u.isAsked,
    );
  }

  /** 只剩一人未弃牌 → 直接获胜 */
  private checkWinPre(room: GameRoom): { users: GameUser[] } | null {
    const activeUsers = this.playerUsers(room).filter((u) => !u.isQuitBet);
    if (activeUsers.length === 1) return { users: activeUsers };
    return null;
  }

  private getTransition(room: GameRoom): 'next-bettor' | 'advance-street' | 'finish' {
    const players = this.playerUsers(room);
    const liveUsers = players.filter(
      (u) => !u.isQuitBet && u.connectStatus !== 'disconnected',
    );
    // 全场 all-in → 直接摊牌（对应旧版 gotoNextPhase 的第一个分支）
    if (liveUsers.length > 0 && liveUsers.every((u) => u.isAllIn)) {
      return 'finish';
    }
    if (this.checkWinPre(room)) return 'finish';
    if (!this.stopBet(room)) return 'next-bettor';
    if (room.gamePhase === 'river') return 'finish';
    return 'advance-street';
  }

  // ---------- 手牌评估（平移自旧版 checkWin） ----------

  /** 评估一手牌（公开接口便于测试）：从 users（未弃牌者）中选出赢家，返回牌型说明 */
  evaluateWin(
    users: GameUser[],
    communityCards: HoldemCard[],
  ): { users: GameUser[]; handRanks: Record<string, string> } | null {
    const getRankValue = (card: HoldemCard) => rankValueMap[card.rank];
    const sortCardsDesc = (cards: HoldemCard[]) =>
      [...cards].sort((a, b) => getRankValue(b) - getRankValue(a));
    const groupByRank = (cards: HoldemCard[]) => {
      const map = new Map<number, HoldemCard[]>();
      for (const card of cards) {
        const value = getRankValue(card);
        if (!map.has(value)) map.set(value, []);
        map.get(value)!.push(card);
      }
      return map;
    };
    const groupBySuit = (cards: HoldemCard[]) => {
      const map = new Map<HoldemCard['suit'], HoldemCard[]>();
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
    const getStraightCards = (cards: HoldemCard[]) => {
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
    const getFlushCards = (cards: HoldemCard[]) => {
      const suitMap = groupBySuit(cards);
      let best: { cards: HoldemCard[]; values: number[] } | null = null;
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
    const getStraightFlushCards = (cards: HoldemCard[]) => {
      const suitMap = groupBySuit(cards);
      let best: { cards: HoldemCard[]; values: number[] } | null = null;
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
    const getFourOfKindCards = (cards: HoldemCard[]) => {
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
      const values = [quad.value, quad.value, quad.value, quad.value, getRankValue(kicker)];
      return { cards: [...quad.list.slice(0, 4), kicker], values };
    };
    const getFullHouseCards = (cards: HoldemCard[]) => {
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
        return {
          cards: [...trip.list.slice(0, 3), ...pairFromTrip.list.slice(0, 2)],
          values: [trip.value, trip.value, trip.value, pairFromTrip.value, pairFromTrip.value],
        };
      }
      const pair = remainingPairs[0];
      return {
        cards: [...trip.list.slice(0, 3), ...pair.list.slice(0, 2)],
        values: [trip.value, trip.value, trip.value, pair.value, pair.value],
      };
    };
    const getThreeOfKindCards = (cards: HoldemCard[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const trip = groups.find((g) => g.list.length >= 3);
      if (!trip) return null;
      const remaining = sortCardsDesc(
        cards.filter((c) => getRankValue(c) !== trip.value),
      ).slice(0, 2);
      return {
        cards: [...trip.list.slice(0, 3), ...remaining],
        values: [trip.value, trip.value, trip.value, ...remaining.map((c) => getRankValue(c))],
      };
    };
    const getTwoPairCards = (cards: HoldemCard[]) => {
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
          (c) => getRankValue(c) !== highPair.value && getRankValue(c) !== lowPair.value,
        ),
      );
      const kicker = remaining[0];
      return {
        cards: [...highPair.list.slice(0, 2), ...lowPair.list.slice(0, 2), kicker],
        values: [highPair.value, highPair.value, lowPair.value, lowPair.value, getRankValue(kicker)],
      };
    };
    const getOnePairCards = (cards: HoldemCard[]) => {
      const rankMap = groupByRank(cards);
      const groups = Array.from(rankMap.entries())
        .map(([value, list]) => ({ value, list }))
        .sort((a, b) => b.value - a.value);
      const pair = groups.find((g) => g.list.length >= 2);
      if (!pair) return null;
      const remaining = sortCardsDesc(
        cards.filter((c) => getRankValue(c) !== pair.value),
      ).slice(0, 3);
      return {
        cards: [...pair.list.slice(0, 2), ...remaining],
        values: [pair.value, pair.value, ...remaining.map((c) => getRankValue(c))],
      };
    };
    const getHighCardCards = (cards: HoldemCard[]) => {
      const bestCards = sortCardsDesc(cards).slice(0, 5);
      return { cards: bestCards, values: bestCards.map((c) => getRankValue(c)) };
    };

    const evaluateBestHand = (cards: HoldemCard[]) => {
      const straightFlush = getStraightFlushCards(cards);
      if (straightFlush) return { score: 9, handRank: '同花顺', ...straightFlush };
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

    const activeUsers = users.filter((u) => !u.isQuitBet);
    if (activeUsers.length === 0) return null;

    const evaluations = activeUsers.map((user) => {
      const allCards = [...(user.cards || []), ...communityCards];
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
    const winners = top.filter((e) => compareValues(e.values, best.values) === 0);

    const handRanks: Record<string, string> = {};
    evaluations.forEach((e) => {
      handRanks[e.user.id] = e.handRank;
    });

    return { users: winners.map((w) => w.user), handRanks };
  }

  // ---------- 结算 ----------

  private revealCards(room: GameRoom, users: GameUser[]) {
    room.revealedCards = {
      ...room.revealedCards,
      ...Object.fromEntries(
        users.map((user) => [user.id, user.cards.map((c) => ({ ...c, isFacedown: false }))]),
      ),
    };
  }

  private addChipsToUser(user: GameUser, amount: number) {
    const chipValues = [200, 100, 50, 20, 10, 5];
    let remaining = amount;
    const next = [...(user.chips || [])];
    for (const value of chipValues) {
      const count = Math.floor(remaining / value);
      if (count <= 0) continue;
      const existing = next.find((c) => c.value === value);
      if (existing) existing.count += count;
      else next.push({ value, count });
      remaining -= count * value;
    }
    user.chips = sortChips(next);
  }

  private giveChipsToWinners(room: GameRoom, winners: GameUser[]) {
    const getUserBetSum = (user: GameUser) =>
      (user.betChips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0);

    // 特殊逻辑：只有一个赢家且他没有 all-in，直接把场上所有 betChips 垒给他
    if (winners.length === 1 && !winners[0].isAllIn) {
      const winner = winners[0];
      for (const user of this.playerUsers(room)) {
        for (const betChip of user.betChips || []) {
          const existingChip = winner.chips.find((c) => c.value === betChip.value);
          if (existingChip) {
            existingChip.count += betChip.count;
          } else {
            winner.chips.push({ value: betChip.value, count: betChip.count });
          }
        }
      }
      winner.chips = sortChips(winner.chips);
      this.playerUsers(room).forEach((u) => {
        u.betChips = [];
        u.betSum = 0;
      });
      return;
    }

    // 多人/边池：按下注等级分池，各池分别比牌
    const contributions = this.playerUsers(room).map((user) => ({
      user,
      amount: getUserBetSum(user),
    }));
    const levels = Array.from(
      new Set(contributions.map((c) => c.amount).filter((v) => v > 0)),
    ).sort((a, b) => a - b);
    if (levels.length === 0) return;

    let prevLevel = 0;
    for (const level of levels) {
      const potAmount = (level - prevLevel) * contributions.filter((c) => c.amount >= level).length;
      if (potAmount <= 0) {
        prevLevel = level;
        continue;
      }
      const eligibleUsers = this.playerUsers(room).filter(
        (u) => !u.isQuitBet && getUserBetSum(u) >= level,
      );
      if (eligibleUsers.length === 0) {
        prevLevel = level;
        continue;
      }
      const potWinResult = this.evaluateWin(eligibleUsers, room.communityCards);
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
          this.addChipsToUser(winner, payoutAmount);
        }
      }
      prevLevel = level;
    }

    this.playerUsers(room).forEach((u) => {
      u.betChips = [];
      u.betSum = 0;
    });
  }

  private finishHand(room: GameRoom) {
    const players = this.playerUsers(room);
    const liveUsers = players.filter(
      (u) => !u.isQuitBet && u.connectStatus !== 'disconnected',
    );
    const allInShowdown = liveUsers.length > 0 && liveUsers.every((u) => u.isAllIn);

    room.currentPlayerId = '';
    room.gamePhase = 'showdown';

    let winners: GameUser[] = [];
    let handRanks: Record<string, string> = {};
    let isCheckWinPre = false;

    if (allInShowdown) {
      // 全场 all-in：所有公共牌和所有人的手牌都翻开（与旧版一致，含已弃牌者）
      room.communityCards = room.communityCards.map((c) => ({ ...c, isFacedown: false }));
      this.revealCards(room, players);
      const result = this.evaluateWin(players, room.communityCards);
      winners = result?.users || [];
      handRanks = result?.handRanks || {};
    } else {
      const winPre = this.checkWinPre(room);
      if (winPre) {
        winners = winPre.users;
        winPre.users.forEach((u) => {
          handRanks[u.id] = '无牌型（对手弃牌）';
        });
        isCheckWinPre = true;
      } else {
        // 河牌圈下完：只开未弃牌玩家的牌
        const activeUsers = players.filter((u) => !u.isQuitBet);
        this.revealCards(room, activeUsers);
        const result = this.evaluateWin(players, room.communityCards);
        winners = result?.users || [];
        handRanks = result?.handRanks || {};
      }
    }

    room.winnerIds = winners.map((w) => w.id);

    // 计算每局开始前的筹码数量
    const chipsBefore: Record<string, number> = {};
    players.forEach((user) => {
      chipsBefore[user.id] =
        (user.chips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0) +
        (user.betChips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0);
    });

    this.giveChipsToWinners(room, winners);

    // 每局结果（塞进框架 roundResults：对局记录 ✓/🤝 + 前端资金变化图都从这里取数）
    const users: Record<string, any> = {};
    players.forEach((user) => {
      const chipsAfter = (user.chips || []).reduce(
        (sum, chip) => sum + chip.value * chip.count,
        0,
      );
      users[user.id] = {
        userName: user.name,
        isWinner: winners.some((w) => w.id === user.id),
        chipsBefore: chipsBefore[user.id],
        chipsAfter,
        profit: chipsAfter - chipsBefore[user.id],
        handRank: handRanks[user.id],
        isAllIn: user.isAllIn,
        isQuitBet: user.isQuitBet,
        isCheckWinPre,
      };
    });
    room.setRoundResult({ users });
  }

  // ---------- 消息 ----------

  private notify(user: GameUser, message: string) {
    this.room.emitToUser({ user, event: HoldemNoticeEvent, data: { message } });
  }

  private broadcastAction(
    room: GameRoom,
    user: GameUser,
    action: string,
    amount?: number,
    totalAmount?: number,
  ) {
    room.emitToAll({
      event: HoldemUserActionEvent,
      data: {
        userId: user.id,
        userName: user.name,
        action,
        amount,
        totalAmount,
        timestamp: Date.now(),
      },
    });
  }

  private isUsersTurn(room: GameRoom, user: GameUser, ctx?: PhaseCtx): boolean {
    return (
      room.checkPhase(ctx, { turnStatus: ['ing'] }) &&
      room.roundStatus === 'ing' &&
      room.currentPlayerId === user.id
    );
  }

  /** 变动筹码后必须换新数组触发 AutoSyncData 标脏 */
  private touchChips(user: GameUser) {
    user.chips = sortChips(user.chips || []);
    user.betChips = sortChips(user.betChips || []);
  }

  private onAddChip({ room, user, data, ctx }: { room: GameRoom; user: GameUser; data: any; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;
    const chipValue = Number(data?.chipValue);
    const chip = (user.chips || []).find((c) => c.value === chipValue);
    if (!chip || chip.count <= 0) {
      this.notify(user, '筹码数量不足');
      return;
    }
    // 小盲首开上限：翻牌前小盲第一次下注总额不能超过大盲，否则大盲必须被动跟注
    const nextBetSum = this.getUserBetSum(user) + chipValue;
    const isSmallBlindOpeningBet =
      room.gamePhase === 'preflop' && user.isSmallBlind && user.betSum === 0;
    if (isSmallBlindOpeningBet && nextBetSum > HoldemBlinds.Big) {
      this.notify(user, '小盲第一次下注总额不能超过10');
      return;
    }

    chip.count -= 1;
    user.chips = (user.chips || []).filter((c) => c.count > 0);
    const dibChip = (user.betChips || []).find((c) => c.value === chipValue);
    if (dibChip) dibChip.count += 1;
    else user.betChips.push({ value: chipValue, count: 1 });
    this.touchChips(user);
    room.sync();
  }

  private onRemoveChip({ room, user, data, ctx }: { room: GameRoom; user: GameUser; data: any; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;
    const chipValue = Number(data?.chipValue);
    const dibChip = (user.betChips || []).find((c) => c.value === chipValue);
    if (!dibChip || dibChip.count <= 0) return;

    dibChip.count -= 1;
    const chip = (user.chips || []).find((c) => c.value === chipValue);
    if (chip) chip.count += 1;
    else user.chips.push({ value: chipValue, count: 1 });
    user.betChips = (user.betChips || []).filter((c) => c.count > 0);
    this.touchChips(user);
    room.sync();
  }

  private onConfirmBet({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;

    const betSum = this.getUserBetSum(user);
    // 小盲首开上限（与 onAddChip 同一规则，堵住梭哈/拿回组合绕过的口子）
    const isSmallBlindOpeningBet =
      room.gamePhase === 'preflop' && user.isSmallBlind && user.betSum === 0;
    if (isSmallBlindOpeningBet && betSum > HoldemBlinds.Big) {
      this.notify(user, '小盲第一次下注总额不能超过10');
      return;
    }
    const requiredBet = user.isBigBlind
      ? HoldemBlinds.Big
      : user.isSmallBlind
        ? HoldemBlinds.Small
        : 0;
    if (requiredBet > 0 && betSum < requiredBet) {
      this.notify(
        user,
        requiredBet === HoldemBlinds.Big ? '大盲注至少需要下注10' : '小盲注至少需要下注5',
      );
      return;
    }
    const maxBet = this.getMaxBet(room, user.id);
    // 下注不足一律拒绝，但筹码已空的短筹码 all-in 跟注允许（手里还有筹码则必须补足）
    const remainingValue = (user.chips || []).reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (betSum < maxBet && remainingValue > 0) {
      this.notify(user, `需要至少跟注${maxBet}，当前你的下注总额${betSum}`);
      return;
    }

    const actionDelta = betSum - (user.betSum || 0);

    if (betSum > maxBet) {
      // 加注，需要重新问询所有玩家
      this.playerUsers(room).forEach((u) => {
        u.isAsked = false;
      });
      user.isAsked = true;
      this.broadcastAction(room, user, 'raise', actionDelta, betSum);
    } else {
      user.isAsked = true;
      this.broadcastAction(room, user, 'call', actionDelta, betSum);
    }

    user.betSum = betSum;

    // 确认下注后筹码为 0 → 标记 all-in
    const remainingChips = (user.chips || []).reduce((sum, chip) => sum + chip.count, 0);
    if (remainingChips === 0) {
      user.isAllIn = true;
      this.broadcastAction(room, user, 'all-in', actionDelta, betSum);
    }

    room.gotoAfterTurn();
  }

  private onQuitBet({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;
    if (
      (user.isSmallBlind && user.betSum < HoldemBlinds.Small) ||
      (user.isBigBlind && user.betSum < HoldemBlinds.Big)
    ) {
      this.notify(user, '小盲和大盲在首轮不能弃牌');
      return;
    }

    user.isQuitBet = true;
    this.broadcastAction(room, user, 'fold');
    room.gotoAfterTurn();
  }

  private onTakeBackBetChips({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;

    const currentBetSum = this.getUserBetSum(user);
    if (currentBetSum <= (user.betSum || 0)) {
      this.notify(user, '还没有加注哦');
      return;
    }

    let amountToTakeBack = currentBetSum - (user.betSum || 0);
    const sortedBetChips = [...(user.betChips || [])].sort((a, b) => b.value - a.value);
    for (const betChip of sortedBetChips) {
      if (amountToTakeBack <= 0) break;
      const maxToTake = Math.min(betChip.count, Math.floor(amountToTakeBack / betChip.value));
      if (maxToTake > 0) {
        betChip.count -= maxToTake;
        amountToTakeBack -= maxToTake * betChip.value;
        const userChip = (user.chips || []).find((c) => c.value === betChip.value);
        if (userChip) userChip.count += maxToTake;
        else user.chips.push({ value: betChip.value, count: maxToTake });
      }
    }
    user.betChips = (user.betChips || []).filter((c) => c.count > 0);
    this.touchChips(user);
    room.sync();
  }

  private onAllIn({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;
    // 把所有筹码移到下注区（还需点「确认」才真正生效，与旧版一致）
    this.moveAllChipsToBet(user);
    room.sync();
  }

  /** 把手里全部筹码移到下注区 */
  private moveAllChipsToBet(user: GameUser) {
    for (const chip of [...(user.chips || [])]) {
      const dibChip = (user.betChips || []).find((c) => c.value === chip.value);
      if (dibChip) dibChip.count += chip.count;
      else user.betChips.push({ value: chip.value, count: chip.count });
    }
    user.chips = [];
    this.touchChips(user);
  }

  /**
   * DP 精确选出总额 amount 的筹码组合（面值均为 5 的倍数，0/1 背包子集和）。
   * 返回 按面值 → 取出数量；凑不出返回 null。
   */
  private pickExactChips(user: GameUser, amount: number): Map<number, number> | null {
    if (amount <= 0) return new Map();
    const flat: number[] = [];
    (user.chips || []).forEach((c) => {
      for (let i = 0; i < c.count; i++) flat.push(c.value);
    });
    const target = amount / 5;
    if (!Number.isInteger(target)) return null;
    const units = flat.map((v) => v / 5);
    // dp[s] = 凑到 s 单位所用筹码下标（外层筹码、内层倒序，每枚最多一次）
    const dp: (number[] | null)[] = Array(target + 1).fill(null);
    dp[0] = [];
    for (let i = 0; i < units.length; i++) {
      for (let s = target; s >= units[i]; s--) {
        if (dp[s] === null && dp[s - units[i]] !== null) {
          dp[s] = [...dp[s - units[i]]!, i];
        }
      }
    }
    const selection = dp[target];
    if (selection === null) return null;

    const takeByValue = new Map<number, number>();
    selection.forEach((idx) => {
      const v = flat[idx];
      takeByValue.set(v, (takeByValue.get(v) || 0) + 1);
    });
    return takeByValue;
  }

  /** 精确凑出 amount 的筹码移到下注区；凑不出返回 false（调用方决定提示） */
  private tryMoveExactChips(user: GameUser, amount: number): boolean {
    const takeByValue = this.pickExactChips(user, amount);
    if (takeByValue === null) return false;
    const nextChips = (user.chips || []).map((c) => ({ ...c }));
    const nextBet = (user.betChips || []).map((c) => ({ ...c }));
    for (const [value, take] of takeByValue) {
      const handChip = nextChips.find((c) => c.value === value);
      if (!handChip || handChip.count < take) return false;
      handChip.count -= take;
      const betChip = nextBet.find((c) => c.value === value);
      if (betChip) betChip.count += take;
      else nextBet.push({ value, count: take });
    }
    user.chips = sortChips(nextChips.filter((c) => c.count > 0));
    user.betChips = sortChips(nextBet);
    return true;
  }

  /** 跟注：自动把筹码精确补齐到当前最高下注，只移动筹码、不代点确认；筹码不足则提示 */
  private onCall({ room, user, ctx }: { room: GameRoom; user: GameUser; ctx?: PhaseCtx }) {
    if (!this.isUsersTurn(room, user, ctx)) return;

    const myBet = this.getUserBetSum(user);
    const maxBet = this.getMaxBet(room, user.id);
    const needed = maxBet - myBet;
    if (needed <= 0) return; // 无需跟注（此时客户端不显示跟注按钮）

    const totalValue = (user.chips || []).reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (totalValue < needed) {
      this.notify(user, '筹码不足');
      return;
    }
    // 面值均为 5 的倍数且为规范币制，totalValue >= needed 时必能精确凑出
    if (!this.tryMoveExactChips(user, needed)) {
      this.notify(user, '筹码无法精确凑出跟注额，请手动调整或梭哈');
      return;
    }
    this.touchChips(user);
    room.sync();
  }

  // ---------- 银行（不限回合，与旧版一致） ----------

  private onExchangeToSmallChips({ room, user }: { room: GameRoom; user: GameUser }) {
    const smallChipsCount = (user.chips || []).find(
      (chip) => chip.value >= 5 && chip.value <= 100 && chip.count > 10,
    );
    if (smallChipsCount) {
      this.notify(user, `有筹码超过10个了，不能再找零`);
      return;
    }
    const largestChip = (user.chips || []).reduce(
      (max, chip) => (chip.value > max.value ? chip : max),
      (user.chips || [])[0],
    );
    if (!largestChip || largestChip.count === 0) {
      this.notify(user, '没有可找零的筹码');
      return;
    }
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
      this.notify(user, '没有可找零的筹码');
      return;
    }
    largestChip.count -= 1;
    if (largestChip.count === 0) {
      user.chips = (user.chips || []).filter((c) => c.value !== largestChip.value);
    }
    for (const { value, count } of rule) {
      const existingChip = (user.chips || []).find((c) => c.value === value);
      if (existingChip) existingChip.count += count;
      else user.chips.push({ value, count });
    }
    this.touchChips(user);
    room.sync();
  }

  private onExchangeToLargeChips({ room, user }: { room: GameRoom; user: GameUser }) {
    const chipValuesToProcess = [5, 10, 20, 50, 100];
    const conversionConfig: Record<
      number,
      { ratio: number; targetValue: number; minExcess: number; returnValue?: number; returnRatio?: number }
    > = {
      5: { ratio: 2, targetValue: 10, minExcess: 5 },
      10: { ratio: 2, targetValue: 20, minExcess: 5 },
      20: { ratio: 3, targetValue: 50, minExcess: 3, returnValue: 10, returnRatio: 1 },
      50: { ratio: 2, targetValue: 100, minExcess: 2 },
      100: { ratio: 2, targetValue: 200, minExcess: 2 },
    };

    let exchanged = false;
    for (const chipValue of chipValuesToProcess) {
      const targetChip = (user.chips || []).find((c) => c.value === chipValue);
      if (!targetChip || targetChip.count <= 5) continue;
      const config = conversionConfig[chipValue];
      if (!config) continue;
      const excessCount = targetChip.count - 5;
      if (excessCount < config.minExcess) continue;
      const convertCount = Math.floor(excessCount / config.ratio) * config.ratio;
      if (convertCount < config.ratio) continue;
      const convertedCount = convertCount / config.ratio;
      const remainingCount = excessCount - convertCount;
      targetChip.count = 5 + remainingCount;

      const targetChipInUser = (user.chips || []).find((c) => c.value === config.targetValue);
      if (targetChipInUser) targetChipInUser.count += convertedCount;
      else user.chips.push({ value: config.targetValue, count: convertedCount });

      if (config.returnValue && config.returnRatio) {
        const returnChipInUser = (user.chips || []).find((c) => c.value === config.returnValue);
        if (returnChipInUser) returnChipInUser.count += convertedCount * config.returnRatio;
        else user.chips.push({ value: config.returnValue, count: convertedCount * config.returnRatio });
      }
      exchanged = true;
    }

    if (!exchanged) {
      this.notify(user, '筹码数量不够化整');
      return;
    }
    this.touchChips(user);
    room.sync();
  }

  private onLoan({ room, user }: { room: GameRoom; user: GameUser }) {
    if ((user.betSum || 0) > 0) {
      this.notify(user, '已经下注');
      return;
    }
    const currentChipsValue = (user.chips || []).reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (currentChipsValue > 100) {
      this.notify(user, '存款高于100不能贷款');
      return;
    }
    const loanChips = initializeChips();
    for (const loanChip of loanChips) {
      const existingChip = (user.chips || []).find((c) => c.value === loanChip.value);
      if (existingChip) existingChip.count += loanChip.count;
      else user.chips.push({ ...loanChip });
    }
    // 记账：贷款欠款为负（还款 +500 对冲，无贷款时还款记为存款）
    user.bankBalance = (user.bankBalance || 0) - 500;
    this.touchChips(user);
    room.sync();
  }

  private onRepay({ room, user }: { room: GameRoom; user: GameUser }) {
    const currentChipsValue = (user.chips || []).reduce(
      (sum, chip) => sum + chip.value * chip.count,
      0,
    );
    if (currentChipsValue < 800) {
      this.notify(user, '低于800不能还款');
      return;
    }
    // 精确扣掉 500（贪心在纯大面值时会只扣出 400，账实不一致）
    const takeByValue = this.pickExactChips(user, 500);
    if (!takeByValue) {
      this.notify(user, '筹码无法精确凑出500，请先找零');
      return;
    }
    const nextChips = (user.chips || []).map((c) => ({ ...c }));
    for (const [value, take] of takeByValue) {
      const handChip = nextChips.find((c) => c.value === value);
      if (handChip) handChip.count -= take;
    }
    user.chips = sortChips(nextChips.filter((c) => c.count > 0));
    // 记账：还款 +500（有欠款时对冲贷款，无欠款时记为存款）
    user.bankBalance = (user.bankBalance || 0) + 500;
    this.touchChips(user);
    room.sync();
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
      case HoldemMsgTypes.AddChip:
        this.onAddChip({ room, user, data, ctx });
        break;
      case HoldemMsgTypes.RemoveChip:
        this.onRemoveChip({ room, user, data, ctx });
        break;
      case HoldemMsgTypes.ConfirmBet:
        this.onConfirmBet({ room, user, ctx });
        break;
      case HoldemMsgTypes.Call:
        this.onCall({ room, user, ctx });
        break;
      case HoldemMsgTypes.QuitBet:
        this.onQuitBet({ room, user, ctx });
        break;
      case HoldemMsgTypes.TakeBackBetChips:
        this.onTakeBackBetChips({ room, user, ctx });
        break;
      case HoldemMsgTypes.AllIn:
        this.onAllIn({ room, user, ctx });
        break;
      case HoldemMsgTypes.ExchangeToSmallChips:
        this.onExchangeToSmallChips({ room, user });
        break;
      case HoldemMsgTypes.ExchangeToLargeChips:
        this.onExchangeToLargeChips({ room, user });
        break;
      case HoldemMsgTypes.Loan:
        this.onLoan({ room, user });
        break;
      case HoldemMsgTypes.Repay:
        this.onRepay({ room, user });
        break;
      default:
        console.error('Unknown holdem message type:', type);
    }
  }
}

export default Holdem;
