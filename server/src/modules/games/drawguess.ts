import {
  Game,
  GameHookParams,
  GameHookReturn,
  GameRoom,
  GameUser,
} from '../game.module';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ChatInstruction } from 'shared/types/game';
import {
  DrawGuessChatMsgTypes,
  DrawGuessCustomMsgTypes,
  DrawGuessDurations,
  DrawGuessRoundUserResult,
  StrokeChunk,
  SyncStrokeDTO,
} from 'shared/types/games/drawguess';

// ===== 词库加载 =====
// 词库为 txt，每行第一个词是该行的类型（提示给猜的人），其余是具体词汇。
interface WordEntry {
  word: string;
  category: string;
}

function loadWordBank(): WordEntry[] {
  if (WORD_BANK && WORD_BANK.length) return WORD_BANK;
  const candidates = [join(__dirname, 'drawguess.words.txt')];
  for (const path of candidates) {
    try {
      const raw = readFileSync(path, 'utf-8');
      const entries: WordEntry[] = [];
      raw.split(/\r?\n/).forEach((line) => {
        const tokens = line.trim().split(/\s+/).filter(Boolean);
        if (tokens.length < 2) return;
        const category = tokens[0];
        for (let i = 1; i < tokens.length; i += 1) {
          entries.push({ word: tokens[i], category });
        }
      });
      if (entries.length) return entries;
    } catch {
      // try next candidate
    }
  }
  return [
    { word: '猫', category: '动物' },
    { word: '苹果', category: '水果' },
    { word: '汽车', category: '交通工具' },
    { word: '太阳', category: '自然' },
    { word: '房子', category: '建筑' },
  ];
}

function unloadWordBank() {
  WORD_BANK = [];
}

function pickWord(): WordEntry {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
}

let WORD_BANK: WordEntry[] = [];

class DrawGuess implements Game {
  categoryHintTimer: NodeJS.Timeout | null = null;
  wordLengthHintTimer: NodeJS.Timeout | null = null;

  onInitGame({ room }: { room: GameRoom }) {}

  onStartGame({ room }: { room: GameRoom }) {
    // 从本地加载词库
    WORD_BANK = loadWordBank();
    room.register('maxRounds', 'public');
    room.register('category', 'private');
    room.register('wordLength', 'private');
    room.register('word', 'private');
    room.register('correctUserIds', 'public');
    room.register('drawerId', 'public');
    room.register('strokes', 'public');
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
    const wordEntry = pickWord();
    room.category = wordEntry.category;
    room.wordLength = wordEntry.word.length;
    room.word = wordEntry.word;
    room.setVisibility('wordLength', 'private');
    room.setVisibility('category', 'private');
    room.setVisibility('word', [room.drawerId]);

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
  }

  onIngTurnStart({ room }: { room: GameRoom }) {
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

    data.forEach((chunk) => {
      if (room.strokes.at(-1).id === chunk.id) {
        
      }
      room.strokes.push(chunk);
    });

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
