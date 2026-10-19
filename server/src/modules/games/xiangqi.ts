import { Game, GameRoom, GameUser } from '../game.module';
import { PhaseCtx } from 'shared/types/game';
import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  XiangqiColor,
  XiangqiDraftState,
  XiangqiCustomMsgTypes,
  XiangqiNoticeEvent,
  XiangqiPiece,
  XiangqiPieceType,
} from 'shared/types/games/xiangqi';

const isInsideBoard = (x: number, y: number) =>
  x >= 0 && x < XIANGQI_COLS && y >= 0 && y < XIANGQI_ROWS;

const isInsidePalace = (color: XiangqiColor, x: number, y: number) => {
  if (x < 3 || x > 5) return false;
  return color === 'black' ? y >= 0 && y <= 2 : y >= 7 && y <= 9;
};

function hasPieceBetweenOnLine(
  pieces: XiangqiPiece[],
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  if (from.x !== to.x && from.y !== to.y) {
    return { blocked: true, count: 0 };
  }
  let count = 0;
  if (from.x === to.x) {
    const step = from.y < to.y ? 1 : -1;
    for (let y = from.y + step; y !== to.y; y += step) {
      if (pieces.some((p) => p.x === from.x && p.y === y)) count += 1;
    }
  } else {
    const step = from.x < to.x ? 1 : -1;
    for (let x = from.x + step; x !== to.x; x += step) {
      if (pieces.some((p) => p.x === x && p.y === from.y)) count += 1;
    }
  }
  return { blocked: false, count };
}

function findPieceAt(pieces: XiangqiPiece[], x: number, y: number) {
  return pieces.find((piece) => piece.x === x && piece.y === y);
}

function isGeneralsFacing(pieces: XiangqiPiece[]) {
  const blackGeneral = pieces.find((p) => p.type === 'general' && p.color === 'black');
  const whiteGeneral = pieces.find((p) => p.type === 'general' && p.color === 'white');
  if (!blackGeneral || !whiteGeneral) return false;
  if (blackGeneral.x !== whiteGeneral.x) return false;
  const minY = Math.min(blackGeneral.y, whiteGeneral.y);
  const maxY = Math.max(blackGeneral.y, whiteGeneral.y);
  for (let y = minY + 1; y < maxY; y += 1) {
    if (pieces.some((piece) => piece.x === blackGeneral.x && piece.y === y)) {
      return false;
    }
  }
  return true;
}

/** 走子规则校验：ok 时附带被吃子（如有）。规则与旧 gomoku.module 的象棋一致 */
function canPieceMove(pieces: XiangqiPiece[], piece: XiangqiPiece, toX: number, toY: number) {
  if (!isInsideBoard(toX, toY)) {
    return { ok: false, message: '目标位置无效' };
  }

  if (piece.x === toX && piece.y === toY) {
    return { ok: false, message: '目标位置无效' };
  }

  const targetPiece = findPieceAt(pieces, toX, toY);
  if (targetPiece && targetPiece.color === piece.color) {
    return { ok: false, message: '不能吃自己的棋子' };
  }

  const dx = toX - piece.x;
  const dy = toY - piece.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (piece.type === 'rook') {
    if (piece.x !== toX && piece.y !== toY) {
      return { ok: false, message: '车只能走直线' };
    }
    const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY });
    if (line.blocked || line.count > 0) {
      return { ok: false, message: '路径被阻挡' };
    }
  } else if (piece.type === 'horse') {
    if (!((absDx === 2 && absDy === 1) || (absDx === 1 && absDy === 2))) {
      return { ok: false, message: '马走日' };
    }
    const legX = absDx === 2 ? piece.x + dx / 2 : piece.x;
    const legY = absDy === 2 ? piece.y + dy / 2 : piece.y;
    if (findPieceAt(pieces, legX, legY)) {
      return { ok: false, message: '蹩马腿' };
    }
  } else if (piece.type === 'elephant') {
    if (!(absDx === 2 && absDy === 2)) {
      return { ok: false, message: '象走田' };
    }
    if (piece.color === 'black' && toY > 4) {
      return { ok: false, message: '象不能过河' };
    }
    if (piece.color === 'white' && toY < 5) {
      return { ok: false, message: '相不能过河' };
    }
    const eyeX = piece.x + dx / 2;
    const eyeY = piece.y + dy / 2;
    if (findPieceAt(pieces, eyeX, eyeY)) {
      return { ok: false, message: '塞象眼' };
    }
  } else if (piece.type === 'advisor') {
    if (!(absDx === 1 && absDy === 1)) {
      return { ok: false, message: '士走斜一步' };
    }
    if (!isInsidePalace(piece.color, toX, toY)) {
      return { ok: false, message: '士只能在九宫内移动' };
    }
  } else if (piece.type === 'general') {
    const isFlyingCapture = targetPiece?.type === 'general' && piece.x === toX;
    if (isFlyingCapture) {
      const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY });
      if (line.blocked || line.count !== 0) {
        return { ok: false, message: '将帅之间有阻挡' };
      }
    } else {
      if (absDx + absDy !== 1) {
        return { ok: false, message: '将帅每次只能走一步' };
      }
      if (!isInsidePalace(piece.color, toX, toY)) {
        return { ok: false, message: '将帅只能在九宫内移动' };
      }
    }
  } else if (piece.type === 'cannon') {
    if (piece.x !== toX && piece.y !== toY) {
      return { ok: false, message: '炮只能走直线' };
    }
    const line = hasPieceBetweenOnLine(pieces, { x: piece.x, y: piece.y }, { x: toX, y: toY });
    if (line.blocked) {
      return { ok: false, message: '炮只能走直线' };
    }
    if (!targetPiece && line.count !== 0) {
      return { ok: false, message: '炮平移时路径不能有棋子' };
    }
    if (targetPiece && line.count !== 1) {
      return { ok: false, message: '炮吃子需要隔一个棋子' };
    }
  } else if (piece.type === 'soldier') {
    const forward = piece.color === 'black' ? 1 : -1;
    const crossedRiver = piece.color === 'black' ? piece.y >= 5 : piece.y <= 4;
    const canSide = crossedRiver && absDx === 1 && dy === 0;
    const canForward = dx === 0 && dy === forward;
    if (!canForward && !canSide) {
      return { ok: false, message: '兵卒走法不合法' };
    }
  }

  const nextPieces = pieces
    .filter((p) => !(targetPiece && p === targetPiece))
    .map((p) => (p === piece ? { ...p, x: toX, y: toY } : p));
  if (isGeneralsFacing(nextPieces)) {
    return { ok: false, message: '将帅不能照面' };
  }

  return { ok: true, captured: targetPiece || null };
}

/** 初始局面：黑方在上（y 0-3），白方（红方）在下（y 6-9） */
function initGame(blackUserId: string, whiteUserId: string): XiangqiPiece[] {
  const pieces: XiangqiPiece[] = [];
  const place = (x: number, y: number, type: XiangqiPieceType, color: XiangqiColor, playerId: string) => {
    pieces.push({ x, y, type, color, playerId });
  };

  const topMain: XiangqiPieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];
  topMain.forEach((type, x) => place(x, 0, type, 'black', blackUserId));
  place(1, 2, 'cannon', 'black', blackUserId);
  place(7, 2, 'cannon', 'black', blackUserId);
  ;[0, 2, 4, 6, 8].forEach((x) => place(x, 3, 'soldier', 'black', blackUserId));

  const bottomMain: XiangqiPieceType[] = ['rook', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'rook'];
  bottomMain.forEach((type, x) => place(x, 9, type, 'white', whiteUserId));
  place(1, 7, 'cannon', 'white', whiteUserId);
  place(7, 7, 'cannon', 'white', whiteUserId);
  ;[0, 2, 4, 6, 8].forEach((x) => place(x, 6, 'soldier', 'white', whiteUserId));

  return pieces;
}

class Xiangqi implements Game {
  room: GameRoom;

  constructor({ room }: { room: GameRoom }) {
    this.room = room;
  }

  onInitGame({ room }: { room: GameRoom }) {}

  onStartGame({ room }: { room: GameRoom }) {
    room.register('blackUserId', 'public');
    room.register('whiteUserId', 'public');
    room.register('currentPlayerId', 'public');
    room.register('pieces', 'public');
    room.register('winnerId', 'public');
    room.register('drafts', 'public');
    room.register('latestMove', 'public');
    Object.values(room.users).forEach((user) => {
      user.register('totalScore', 'public');
    });
  }

  // 一局棋（round）：定黑白、摆初始局面、清预选
  onBeforeRoundStart({ room }: { room: GameRoom }) {
    room.shuffleUsers();
    const [black, white] = room.userOrder;
    room.blackUserId = black || '';
    room.whiteUserId = white || '';
    room.pieces = initGame(room.blackUserId, room.whiteUserId);
    room.winnerId = '';
    room.drafts = {};
    room.latestMove = null;
    room.sync();
    return { skip: true };
  }

  // 走子无前置阶段；轮到谁由 turn 奇偶决定（turn 1 黑先）
  onBeforeTurnStart({ room }: { room: GameRoom }) {
    room.currentPlayerId =
      room.turn % 2 === 1 ? room.blackUserId : room.whiteUserId;
    return { skip: true };
  }

  // 等走子，不限时
  onIngTurnStart({ room }: { room: GameRoom }) {
    return {};
  }

  onAfterTurnStart({ room }: { room: GameRoom }) {
    return { skip: true };
  }

  onAfterTurnEnd({ room }: { room: GameRoom }) {
    if (room.winnerId) {
      room.gotoAfterRound();
    } else {
      room.gotoBeforeTurn();
    }
  }

  onAfterRoundStart({ room }: { room: GameRoom }) {
    const highestScore = Math.max(
      ...Object.values(room.users).map((user) => user.totalScore || 0),
      0,
    );
    const roundResults = Object.values(room.users).reduce(
      (acc, user) => {
        acc[user.id] = { isWinner: (user.totalScore || 0) === highestScore && highestScore > 0 };
        return acc;
      },
      {} as { [userId: string]: { isWinner: boolean } },
    );
    room.setRoundResult({ users: roundResults });
  }

  private myDraft(room: GameRoom, userId: string): XiangqiDraftState | null {
    return (room.drafts?.[userId] as XiangqiDraftState | null) || null;
  }

  private setMyDraft(room: GameRoom, userId: string, draft: XiangqiDraftState | null) {
    room.drafts = { ...(room.drafts || {}), [userId]: draft };
  }

  private notify(user: GameUser, message: string) {
    this.room.emitToUser({ user, event: XiangqiNoticeEvent, data: { message } });
  }

  // 点选流程：无预选时点自己棋子 → 选中；选中后点合法落点 → 预走（ghost）；
  // 再点同一落点 / 发 Confirm → 确认走子；点别的棋子 → 改选
  private onClick({
    room,
    user,
    data,
    ctx,
  }: {
    room: GameRoom;
    user: GameUser;
    data: { x?: number; y?: number };
    ctx?: PhaseCtx;
  }) {
    if (!room.isGamePlaying() || !room.checkPhase(ctx, { turnStatus: ['ing'] })) return;
    if (room.currentPlayerId !== user.id || room.winnerId) return;

    const x = Number(data?.x);
    const y = Number(data?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !isInsideBoard(x, y)) return;

    const targetPiece = findPieceAt(room.pieces, x, y);
    const draft = this.myDraft(room, user.id);

    if (!draft) {
      // 尚无预选：点自己的棋子选中，其它位置提示
      if (!targetPiece || targetPiece.playerId !== user.id) {
        this.notify(user, '请先点击自己的棋子');
        return;
      }
      this.setMyDraft(room, user.id, {
        original: { x, y },
        current: { x, y },
        captured: null,
        moveKind: 'none',
      });
      room.sync();
      return;
    }

    if (draft.moveKind === 'none') {
      // 已选中棋子：点自己的其它棋子 = 改选；点空位/敌子 = 尝试作为落点
      if (targetPiece && targetPiece.playerId === user.id) {
        this.setMyDraft(room, user.id, {
          original: { x, y },
          current: { x, y },
          captured: null,
          moveKind: 'none',
        });
        room.sync();
        return;
      }
      const sourcePiece = findPieceAt(room.pieces, draft.original.x, draft.original.y);
      if (!sourcePiece || sourcePiece.playerId !== user.id) {
        this.setMyDraft(room, user.id, null);
        room.sync();
        return;
      }
      const rule = canPieceMove(room.pieces, sourcePiece, x, y);
      if (!rule.ok) {
        this.notify(user, rule.message || '不能移动到该位置');
        return;
      }
      this.setMyDraft(room, user.id, {
        original: { ...draft.original },
        current: { x, y },
        captured: rule.captured ? { x: rule.captured.x, y: rule.captured.y } : null,
        moveKind: rule.captured ? 'capture' : 'move',
      });
      room.sync();
      return;
    }

    // 已有预走落点：再点同一落点 = 确认
    if (x === draft.current.x && y === draft.current.y) {
      this.confirm({ room, user, ctx });
      return;
    }

    // 点自己的其它棋子 = 改选
    if (targetPiece && targetPiece.playerId === user.id) {
      this.setMyDraft(room, user.id, {
        original: { x, y },
        current: { x, y },
        captured: null,
        moveKind: 'none',
      });
      room.sync();
      return;
    }

    // 换一个落点：校验规则
    const sourcePiece = findPieceAt(room.pieces, draft.original.x, draft.original.y);
    if (!sourcePiece || sourcePiece.playerId !== user.id) {
      this.setMyDraft(room, user.id, null);
      room.sync();
      return;
    }
    const rule = canPieceMove(room.pieces, sourcePiece, x, y);
    if (!rule.ok) {
      this.notify(user, rule.message || '不能移动到该位置');
      return;
    }
    this.setMyDraft(room, user.id, {
      original: { ...draft.original },
      current: { x, y },
      captured: rule.captured ? { x: rule.captured.x, y: rule.captured.y } : null,
      moveKind: rule.captured ? 'capture' : 'move',
    });
    room.sync();
  }

  private confirm({
    room,
    user,
    ctx,
  }: {
    room: GameRoom;
    user: GameUser;
    ctx?: PhaseCtx;
  }) {
    if (!room.checkPhase(ctx, { turnStatus: ['ing'] })) return;
    if (room.currentPlayerId !== user.id || room.winnerId) return;

    const draft = this.myDraft(room, user.id);
    if (!draft || draft.moveKind === 'none') {
      this.notify(user, '先点选棋子，再点落点');
      return;
    }

    const piece = room.pieces.find(
      (p) => p.playerId === user.id && p.x === draft.original.x && p.y === draft.original.y,
    );
    if (!piece) {
      this.setMyDraft(room, user.id, null);
      room.sync();
      return;
    }

    // 落点可能在预选后已变化（对手棋子走上来等），确认时重新校验
    const rule = canPieceMove(room.pieces, piece, draft.current.x, draft.current.y);
    if (!rule.ok) {
      this.notify(user, rule.message || '移动不合法');
      return;
    }

    const capturedPiece = rule.captured;
    if (capturedPiece) {
      room.pieces = room.pieces.filter((p) => p !== capturedPiece);
    }
    piece.x = draft.current.x;
    piece.y = draft.current.y;
    // AutoSyncData 只在属性赋值时标脏：必须换新数组，sync 才会把新棋盘带给客户端
    room.pieces = [...room.pieces];
    room.latestMove = { x: piece.x, y: piece.y };
    this.setMyDraft(room, user.id, null);

    if (capturedPiece?.type === 'general') {
      room.winnerId = user.id;
      user.totalScore = (user.totalScore || 0) + 1;
    }

    room.sync();
    room.gotoAfterTurn();
  }

  private onCancel({ room, user }: { room: GameRoom; user: GameUser }) {
    if (!this.myDraft(room, user.id)) return;
    this.setMyDraft(room, user.id, null);
    room.sync();
  }

  /** 认输：对手直接获胜 */
  private onResign({ room, user }: { room: GameRoom; user: GameUser }) {
    if (!room.isGamePlaying() || room.roundStatus !== 'ing' || room.turnStatus === 'after') return;
    if (room.winnerId) return;
    const opponentId = room.blackUserId === user.id
      ? room.whiteUserId
      : room.whiteUserId === user.id
        ? room.blackUserId
        : '';
    if (!opponentId) return; // 观战者不能认输

    room.winnerId = opponentId;
    const opponent = room.users[opponentId];
    if (opponent) {
      opponent.totalScore = (opponent.totalScore || 0) + 1;
    }
    room.sync();
    room.gotoAfterTurn();
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
      case XiangqiCustomMsgTypes.Click:
        this.onClick({ room, user, data, ctx });
        break;
      case XiangqiCustomMsgTypes.Confirm:
        this.confirm({ room, user, ctx });
        break;
      case XiangqiCustomMsgTypes.Cancel:
        this.onCancel({ room, user });
        break;
      case XiangqiCustomMsgTypes.Resign:
        this.onResign({ room, user });
        break;
      default:
        console.error('Unknown xiangqi message type:', type);
    }
  }
}

export default Xiangqi;
