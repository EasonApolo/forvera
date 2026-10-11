import {
  Game,
  GameHookParams,
  GameHookReturn,
  GameRoom,
  GameUser,
} from '../game.module';
import { ChatInstruction, PhaseCtx } from 'shared/types/game';
import {
  DrawGuessChatMsgTypes,
  DrawGuessCustomMsgTypes,
  DrawGuessDurations,
  DrawGuessReaction,
  DrawGuessRoundUserResult,
  StrokeChunk,
  SyncStrokeDTO,
  ReplayData,
} from 'shared/types/games/drawguess';
import mongoose from 'mongoose';

type DrawGuessWord = {
  name: string;
  category: string;
  changeCount: number;
};
interface DrawGuessWordDocument extends mongoose.Document, DrawGuessWord {}
const DrawGuessWordSchema = new mongoose.Schema<DrawGuessWordDocument>(
  {
    name: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    changeCount: { type: Number, default: 0, min: 0 },
  },
  { collection: 'drawguess' },
);

class DrawGuess implements Game {
  private static wordModel: mongoose.Model<DrawGuessWordDocument>;
  categoryHintTimer: NodeJS.Timeout | null = null;
  wordLengthHintTimer: NodeJS.Timeout | null = null;
  room: GameRoom;

  constructor({ room }: { room: GameRoom }) {
    this.room = room;
  }

  static registerModels(
    createModel: (name: string, schema: mongoose.Schema) => mongoose.Model<any>,
  ) {
    DrawGuess.wordModel = createModel('DrawGuessWord', DrawGuessWordSchema);
  }
  
  onUnmounted() {
    if (this.categoryHintTimer) {
      clearTimeout(this.categoryHintTimer);
      this.categoryHintTimer = null;
    }
    if (this.wordLengthHintTimer) {
      clearTimeout(this.wordLengthHintTimer);
      this.wordLengthHintTimer = null;
    }
    if (this.reactionSyncTimer) {
      clearTimeout(this.reactionSyncTimer);
      this.reactionSyncTimer = null;
    }
  }

  async pickWord(excludeName?: string): Promise<DrawGuessWord> {
    const candidates = await DrawGuess.wordModel.aggregate([
      { $match: {
        $or: [{ changeCount: { $lt: 10 } }, { changeCount: { $exists: false } }],
        ...(excludeName ? { name: { $ne: excludeName } } : {}),
      } },
      { $sample: { size: 10 } },
    ]);
    const totalWeight = candidates.reduce(
      (sum, candidate) => sum + Math.max(0, 1 - (candidate.changeCount || 0) * 0.1), 0,
    );
    if (!totalWeight) throw new Error('你画我猜词库中没有可用的词');
    let choice = Math.random() * totalWeight;
    for (const candidate of candidates) {
      choice -= Math.max(0, 1 - (candidate.changeCount || 0) * 0.1);
      if (choice < 0) return candidate;
    }
    return candidates[candidates.length - 1];
  }

  onInitGame({ room }: { room: GameRoom }) {}

  onStartGame({ room }: { room: GameRoom }) {
    room.register('maxRounds', 'public');
    room.register('category', 'private');
    room.register('wordLength', 'private');
    room.register('word', 'private');
    room.register('correctUserIds', 'public');
    room.register('drawerId', 'public');
    room.register('strokes', 'public');
    room.register('replayData', 'public');
    room.register('likes', 'public');
    room.register('dislikes', 'public');
    Object.values(room.users).forEach((user) => {
      user.register('totalScore', 'public');
      user.register('turnScore', 'public');
    });
  }

  // 一局游戏包括多个回合，胜者算一分，一场游戏可以有多局，每局游戏开始时确定玩家和顺序（可能有增减）。
  onBeforeRoundStart({ room }: GameHookParams) {
    // 确定总turn数
    const userCount = room.userOrder.length;
    let maxRounds = 0;
    switch (userCount) {
      case 2:
        maxRounds = 4;
        break;
      case 3:
        maxRounds = 9;
        break;
      case 4:
        maxRounds = 12;
        break;
      case 5:
        maxRounds = 10;
        break;
      default:
        maxRounds = userCount * 2; // 6 人及以上
    }
    room.maxRounds = maxRounds;

    // 清空上一局的回放数据
    room.replayData = {};

    // 随机排序
    room.shuffleUsers();
  }

  onBeforeTurnStart({ room }: { room: GameRoom }) {
    // 清空上回合数据
    room.strokes = [];
    room.correctUserIds = [];
    room.word = '';
    room.category = '';
    room.wordLength = 0;
    room.likes = 0;
    room.dislikes = 0;
    room.setVisibility('word', 'private');
    room.setVisibility('category', 'private');
    room.setVisibility('wordLength', 'private');

    // 确定画的人
    const currentDrawerId = room.drawerId;
    const nextUser = room.getNextUser({ current: currentDrawerId });
    room.drawerId = nextUser.id;

    // 确定词
    const turn = room.turn;
    this.pickWord().then((wordEntry: DrawGuessWord) => {
      if (room.turn !== turn || room.turnStatus !== 'before') return;
      room.category = wordEntry.category;
      room.wordLength = wordEntry.name.length;
      room.word = wordEntry.name;
      room.setVisibility('wordLength', 'private');
      room.setVisibility('category', 'private');
      room.setVisibility('word', [room.drawerId]);
      room.sync();
    }).catch((error) => console.error('Failed to pick drawguess word', error));

    return { duration: DrawGuessDurations.TurnBeforeDuration };
  }

  /** 武装分类/字数提示计时器；按回合开始时刻计算剩余延迟，已到点的提示不再武装（换词时会立即公开） */
  private armHintTimers(room: GameRoom) {
    if (this.categoryHintTimer) {
      clearTimeout(this.categoryHintTimer);
      this.categoryHintTimer = null;
    }
    if (this.wordLengthHintTimer) {
      clearTimeout(this.wordLengthHintTimer);
      this.wordLengthHintTimer = null;
    }
    const elapsed = Date.now() - room.startTime;
    const isTurnIng = () =>
      room.isGamePlaying() && room.roundStatus === 'ing' && room.turnStatus === 'ing';

    const categoryDelay = DrawGuessDurations.CategoryHintDelay - elapsed;
    if (categoryDelay > 0) {
      this.categoryHintTimer = setTimeout(() => {
        this.categoryHintTimer = null;
        if (!isTurnIng()) return;
        room.setVisibility('category', 'public');
        room.sync();
      }, categoryDelay);
    }
    const wordLengthDelay = DrawGuessDurations.WordLengthHintDelay - elapsed;
    if (wordLengthDelay > 0) {
      this.wordLengthHintTimer = setTimeout(() => {
        this.wordLengthHintTimer = null;
        if (!isTurnIng()) return;
        room.setVisibility('wordLength', 'public');
        room.sync();
      }, wordLengthDelay);
    }
  }

  onIngTurnStart({ room }: { room: GameRoom }) {
    // 制定后续游戏进程
    this.armHintTimers(room);

    return { duration: DrawGuessDurations.TurnDuration };
  }

  onDrawStroke({
    room,
    user,
    data,
  }: {
    room: GameRoom;
    user: GameUser;
    data: SyncStrokeDTO;
  }) {
    if (!room.isGamePlaying() || !room.checkPhase(undefined, { turnStatus: ['ing'] })) return;
    if (room.drawerId !== user.id) return;
    if (!data || !Array.isArray(data) || !data.length) return;

    room.strokes.push(...data);

    room.emitToAllExcept({
      userId: room.drawerId,
      event: DrawGuessCustomMsgTypes.SyncStrokes,
      data: data as SyncStrokeDTO,
    });
  }

  onClearCanvas({ room, user }: { room: GameRoom; user: GameUser }) {
    if (!room.isGamePlaying() || !room.checkPhase(undefined, { turnStatus: ['ing'] })) return;
    if (room.drawerId !== user.id) return;
    room.strokes = [];
    room.emitToAllExcept({
      userId: user.id,
      event: DrawGuessCustomMsgTypes.ClearCanvas,
    });
  }

  onAfterTurnStart({ room }: { room: GameRoom }) {
    room.setVisibility('word', 'public');
    room.replayData[room.turn] = {
      drawerId: room.drawerId,
      strokes: [...room.strokes],
      turn: room.turn,
      word: room.word,
      likes: room.likes,
      dislikes: room.dislikes,
    };
    return { duration: DrawGuessDurations.TurnAfterDuration };
  }

  onAfterTurnEnd({ room }: { room: GameRoom }) {
    // 冲掉待发的节流推送，保证最终计数一定广播（并在下方存入回放数据）
    this.flushReactionSync(room);
    const replay = room.replayData[room.turn];
    if (replay) {
      room.replayData[room.turn] = {
        ...replay,
        likes: room.likes,
        dislikes: room.dislikes,
      };
    }
    // 下一回合还是结束本局游戏？
    if (room.turn >= room.maxRounds) {
      room.gotoAfterRound();
    } else {
      room.gotoBeforeTurn();
    }
  }

  onAfterRoundStart({ room }: { room: GameRoom }) {
    const highestScore = Math.max(
      ...Object.values(room.users).map((user) => user.totalScore),
    );
    const roundResults = Object.values(room.users).reduce(
      (acc, user) => {
        acc[user.id] = { isWinner: user.totalScore === highestScore };
        return acc;
      },
      {} as { [userId: string]: DrawGuessRoundUserResult },
    );
    room.setRoundResult({ users: roundResults });
  }

  onRequestReplayData({
    room,
    user,
    turn,
  }: {
    room: GameRoom;
    user: GameUser;
    turn: number;
  }) {
    if (!room.replayData[turn]) return;
    room.emitToUser({
      userId: user.id,
      event: DrawGuessCustomMsgTypes.SyncReplayData,
      data: room.replayData[turn] as ReplayData,
    });
  }

  private changingWord = false;

  async onChangeWord({
    room,
    user,
    ctx,
  }: {
    room: GameRoom;
    user: GameUser;
    ctx?: PhaseCtx;
  }) {
    if (!room.isGamePlaying() || room.roundStatus !== 'ing') return;
    if (!room.checkPhase(ctx, { turnStatus: ['before', 'ing'] })) return;
    const inBeforePhase = room.turnStatus === 'before';
    const inChangeWindow =
      room.turnStatus === 'ing' &&
      Date.now() - room.startTime <= DrawGuessDurations.ChangeWordWindow;
    if ((!inBeforePhase && !inChangeWindow) ||
      room.drawerId !== user.id ||
      !room.word || this.changingWord) return;
    this.changingWord = true;
    const oldWord = room.word;
    // 异步期间阶段可能漂移：以分发时快照 + 当前阶段允许集双重校验
    const stillValid = () =>
      room.isGamePlaying() &&
      room.roundStatus === 'ing' &&
      room.checkPhase(ctx, { turnStatus: ['before', 'ing'] });
    try {
      const nextWord = await this.pickWord(oldWord);
      if (!stillValid() || room.word !== oldWord) return;
      await DrawGuess.wordModel.updateOne(
        { name: oldWord },
        { $inc: { changeCount: 1 } },
      ).exec();
      if (!stillValid()) return;
      room.category = nextWord.category;
      room.wordLength = nextWord.name.length;
      room.word = nextWord.name;
      room.setVisibility('word', [room.drawerId]);
      // 提示可见性跟随回合计时：已到点的（15s/30s）以新值立即公开，未到点的保持私有、按原时刻触发
      const elapsed = Date.now() - room.startTime;
      room.setVisibility(
        'category',
        elapsed >= DrawGuessDurations.CategoryHintDelay ? 'public' : 'private',
      );
      room.setVisibility(
        'wordLength',
        elapsed >= DrawGuessDurations.WordLengthHintDelay ? 'public' : 'private',
      );
      room.sync();

      if (!inBeforePhase) {
        // 重新武装未到点的提示计时器（剩余延迟）
        this.armHintTimers(room);
        // 其他玩家 toast + 聊天系统消息
        room.emitToAllExcept({
          userId: room.drawerId,
          event: DrawGuessCustomMsgTypes.WordChanged,
        });
        room.emitToAll({
          event: 'message',
          data: {
            id: `system-${Date.now()}`,
            userName: '',
            type: 'system',
            content: '画家更换了词汇',
          },
        });
      }
    } catch (error) {
      console.error('Failed to change drawguess word', error);
    } finally {
      this.changingWord = false;
    }
  }

  /** 点赞/点踩：娱乐性累加，不看用户身份；drawer 自己不能投 */
  private reactionSyncTimer: NodeJS.Timeout | null = null;

  /** 节流推送：计数立即累加，广播合并到最多每 200ms 一次（trailing） */
  private scheduleReactionSync(room: GameRoom) {
    if (this.reactionSyncTimer) return;
    this.reactionSyncTimer = setTimeout(() => {
      this.reactionSyncTimer = null;
      if (!room.isGamePlaying()) return;
      room.sync();
    }, 200);
  }

  private flushReactionSync(room: GameRoom) {
    if (this.reactionSyncTimer) {
      clearTimeout(this.reactionSyncTimer);
      this.reactionSyncTimer = null;
      if (room.isGamePlaying()) room.sync();
    }
  }

  onReaction({
    room,
    user,
    value,
  }: {
    room: GameRoom;
    user: GameUser;
    value: DrawGuessReaction;
  }) {
    if (!room.isGamePlaying() || !room.checkPhase(undefined, { turnStatus: ['after'] })) return;
    if (room.drawerId === user.id) return;
    if (value === 'like') {
      room.likes = (room.likes || 0) + 1;
    } else if (value === 'dislike') {
      room.dislikes = (room.dislikes || 0) + 1;
    } else {
      return;
    }
    this.scheduleReactionSync(room);
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
      case DrawGuessCustomMsgTypes.DrawStroke:
        this.onDrawStroke({ room, user, data });
        break;
      case DrawGuessCustomMsgTypes.ClearCanvas:
        this.onClearCanvas({ room, user });
        break;
      case DrawGuessCustomMsgTypes.SyncReplayData:
        this.onRequestReplayData({ room, user, turn: data.turn });
        break;
      case DrawGuessCustomMsgTypes.ChangeWord:
        this.onChangeWord({ room, user, ctx });
        break;
      case DrawGuessCustomMsgTypes.Reaction:
        this.onReaction({ room, user, value: data });
        break;
      default:
        console.error('Unknown message type:', type);
    }
  }

  onMessageBefore({
    room,
    user,
    text,
  }: {
    room: GameRoom;
    user: GameUser;
    text: string;
  }): ChatInstruction | undefined {
    // 是普通消息还是在猜
    if (
      !room.isGamePlaying() ||
      room.roundStatus !== 'ing' ||
      !room.checkPhase(undefined, { turnStatus: ['ing'] })
    )
      return;
    if (room.drawerId === user.id) return;
    if (room.correctUserIds.includes(user.id)) return;
    if (!text) return;

    if (text === room.word) {
      // 猜对了
      room.correctUserIds = [...room.correctUserIds, user.id];

      // 记分
      const score =
        room.correctUserIds.length === 1
          ? 3
          : room.correctUserIds.length === 2
            ? 2
            : 1;
      user.turnScore = (user.turnScore || 0) + score;
      user.totalScore = (user.totalScore || 0) + score;
      const drawer = room.users[room.drawerId];
      drawer.turnScore = (drawer.turnScore || 0) + 1;
      drawer.totalScore = (drawer.totalScore || 0) + 1;

      // 如果所有人都猜对了，提前结束回合
      const allGuessersCorrect = Object.values(room.users).every((u) => {
        return u.id === room.drawerId || room.correctUserIds.includes(u.id);
      });
      if (allGuessersCorrect) {
        room.gotoAfterTurn();
      }

      // 将msg替换为猜对文案
      return {
        type: 'cover',
        content: {
          content: '猜对了',
          type: DrawGuessChatMsgTypes.GuessCorrect,
        },
      };
    } else {
    }
  }
}

export default DrawGuess;
