import {
  Game,
  GameHookParams,
  GameHookReturn,
  GameRoom,
  GameUser,
} from '../game.module';
import { ChatInstruction } from 'shared/types/game';
import {
  DrawGuessChatMsgTypes,
  DrawGuessCustomMsgTypes,
  DrawGuessDurations,
  DrawGuessRoundUserResult,
  StrokeChunk,
  SyncStrokeDTO,
  ReplayData,
  VoteDTO,
  Vote,
} from 'shared/types/games/drawguess';
import { ThrottledDataResolver } from 'shared/utils';
import mongoose from 'mongoose';

type DrawGuessWord = {
  name: string;
  category: string;
  dislikes: number;
};
interface DrawGuessWordDocument extends mongoose.Document, DrawGuessWord {}
const DrawGuessWordSchema = new mongoose.Schema<DrawGuessWordDocument>({
  name: { type: String, required: true },
  category: { type: String, required: true },
  dislikes: { type: Number, default: 0 },
});

export const DEFAULT_DRAWGUESS_WORDS: DrawGuessWord[] = [
  { name: '猫', category: '动物', dislikes: 0 },
  { name: '苹果', category: '水果', dislikes: 0 },
  { name: '汽车', category: '交通工具', dislikes: 0 },
  { name: '太阳', category: '自然', dislikes: 0 },
  { name: '房子', category: '建筑', dislikes: 0 },
];

class DrawGuess implements Game {
  private static wordModel: mongoose.Model<DrawGuessWordDocument>;
  categoryHintTimer: NodeJS.Timeout | null = null;
  wordLengthHintTimer: NodeJS.Timeout | null = null;
  voteSender = new ThrottledDataResolver<{ userId: string; vote: VoteDTO }>(
    1000,
    this.sendVotes.bind(this),
  );
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
  }

  async pickWord(): Promise<DrawGuessWord> {
    const candidates = await DrawGuess.wordModel.aggregate([
      { $sample: { size: 10 } },
    ]);
    console.log('candidates', candidates);
    if (candidates.length > 0) {
      let i = 0;
      while (i < candidates.length - 1) {
        const candidate = candidates[i];
        const prob = Math.max(0.1, 1 - (candidate.dislikes || 0) * 0.1);
        if (prob < 1 && Math.random() > prob) {
          i++;
          continue;
        } else {
          console.log('pickword', candidate);
          return candidate;
        }
      }
      return candidates.at(-1);
    }
    return (
      DEFAULT_DRAWGUESS_WORDS[
        Math.floor(Math.random() * DEFAULT_DRAWGUESS_WORDS.length)
      ]
    );
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

    // 确定画的人
    const currentDrawerId = room.drawerId;
    const nextUser = room.getNextUser({ current: currentDrawerId });
    room.drawerId = nextUser.id;

    // 确定词
    this.pickWord().then((wordEntry: DrawGuessWord) => {
      room.category = wordEntry.category;
      room.wordLength = wordEntry.name.length;
      room.word = wordEntry.name;
      room.setVisibility('wordLength', 'private');
      room.setVisibility('category', 'private');
      room.setVisibility('word', [room.drawerId]);
      room.sync();
    });

    return { duration: DrawGuessDurations.TurnBeforeDuration };
  }

  onIngTurnStart({ room }: { room: GameRoom }) {
    // 制定后续游戏进程
    this.categoryHintTimer = setTimeout(() => {
      this.categoryHintTimer = null;
      room.setVisibility('category', 'public');
      room.sync();
    }, DrawGuessDurations.CategoryHintDelay);
    this.wordLengthHintTimer = setTimeout(() => {
      this.wordLengthHintTimer = null;
      room.setVisibility('wordLength', 'public');
      room.sync();
    }, DrawGuessDurations.WordLengthHintDelay);

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
    if (!room.isGamePlaying()) return;
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
    if (!room.isGamePlaying()) return;
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
    };
    return { duration: DrawGuessDurations.TurnAfterDuration };
  }

  onAfterTurnEnd({ room }: { room: GameRoom }) {
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

  onVote({
    room,
    user,
    data,
  }: {
    room: GameRoom;
    user: GameUser;
    data: VoteDTO;
  }) {
    this.voteSender.addData({ userId: user.id, vote: data });
  }

  onChangeWord({ room, user }: { room: GameRoom; user: GameUser }) {
    if (!room.isGamePlaying()) return;
    DrawGuess.wordModel.findOneAndUpdate(
      { name: room.word },
      { $inc: { dislikes: 1 } },
      { new: true, upsert: true },
    ).exec();
  }

  async sendVotes(votes: { userId: string; vote: VoteDTO }[]) {
    for (const userId of Object.keys(this.room.users)) {
      const otherUsersVotes = votes
        .filter((v) => v.userId !== userId)
        .map((v) => v.vote)
        .flat();
      if (!otherUsersVotes.length) continue;
      this.room.emitToUser({
        userId,
        event: DrawGuessCustomMsgTypes.Vote,
        data: otherUsersVotes,
      });
    }
    votes.length = 0;
  }

  onMsg({
    type,
    room,
    user,
    data,
  }: {
    type: string;
    room: GameRoom;
    user: GameUser;
    data: any;
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
      case DrawGuessCustomMsgTypes.Vote:
        this.onVote({ room, user, data });
        break;
      case DrawGuessCustomMsgTypes.ChangeWord:
        this.onChangeWord({ room, user });
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
      room.turnStatus !== 'ing' ||
      room.roundStatus !== 'ing'
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
