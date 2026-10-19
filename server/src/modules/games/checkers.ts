import { Game, GameRoom, GameUser } from '../game.module';
import { PhaseCtx } from 'shared/types/game';
import {
  CheckersColor,
  CheckersDraftState,
  CheckersCustomMsgTypes,
  CheckersNoticeEvent,
  CheckersPiece,
  CheckersPosition,
} from 'shared/types/games/checkers';

// ==================== 棋盘与规则（平移自旧 gomoku.module 的跳棋） ====================

function generateBoard(): CheckersPosition[] {
  const positions: CheckersPosition[] = [];

  // 中心六边形
  for (let r = -4; r <= 4; r++) {
    for (let q = Math.max(-4, -r - 4); q <= Math.min(4, -r + 4); q++) {
      positions.push({ q, r });
    }
  }

  // 上三角 (r<-4)
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      positions.push({ q, r });
    }
  }

  // 右上三角 (q>4)
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      positions.push({ q, r });
    }
  }

  // 右下三角 (s<-4)
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      positions.push({ q, r: -q - s });
    }
  }

  // 下三角 (r>4)
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      positions.push({ q, r });
    }
  }

  // 左下三角 (q<-4)
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      positions.push({ q, r });
    }
  }

  // 左上三角 (s>4)
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      positions.push({ q, r: -q - s });
    }
  }

  return positions;
}

function getStartZones() {
  const zones: Record<number, CheckersPosition[]> = {};

  zones[0] = [];
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      zones[0].push({ q, r });
    }
  }

  zones[1] = [];
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      zones[1].push({ q, r });
    }
  }

  zones[2] = [];
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      zones[2].push({ q, r: -q - s });
    }
  }

  zones[3] = [];
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      zones[3].push({ q, r });
    }
  }

  zones[4] = [];
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      zones[4].push({ q, r });
    }
  }

  zones[5] = [];
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      zones[5].push({ q, r: -q - s });
    }
  }

  return zones;
}

const OPPOSITE_ZONE: Record<number, number> = { 0: 3, 1: 4, 2: 5, 3: 0, 4: 1, 5: 2 };

function getOppositeZoneIndex(zoneIndex: number) {
  return OPPOSITE_ZONE[zoneIndex] ?? zoneIndex;
}

function getStartZoneIndices(playerCount: number): number[] {
  const shuffle = (arr: number[]) => {
    const next = [...arr];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  };

  if (playerCount === 2) {
    return [0, 3]; // 上、下
  }
  if (playerCount === 3) {
    // 3 人采用隔位三角形，并在两套对称布局中随机
    const patterns = [
      [0, 2, 4],
      [1, 3, 5],
    ];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    return shuffle(pattern);
  }
  if (playerCount === 4) {
    // 4 人布局：左上、上、下、右下
    return shuffle([5, 0, 3, 2]);
  }
  return [];
}

/** 初始局面：用模板 playerId 生成，开局时再映射到真实用户 id */
function initGame(startZoneIndices: number[]): CheckersPiece[] {
  const pieces: CheckersPiece[] = [];
  const zones = getStartZones();
  const allColors: CheckersColor[] = ['yellow', 'blue', 'red'];
  for (let i = allColors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allColors[i], allColors[j]] = [allColors[j], allColors[i]];
  }
  const colors = allColors;

  startZoneIndices.forEach((zoneIndex, playerIndex) => {
    const zone = zones[zoneIndex];
    const color = colors[playerIndex % colors.length];
    const playerId = `player${playerIndex}`;
    zone.forEach((pos) => {
      pieces.push({ q: pos.q, r: pos.r, color, playerId });
    });
  });

  return pieces;
}

const DIRECTIONS = [
  { dq: 1, dr: 0 },
  { dq: 1, dr: -1 },
  { dq: 0, dr: -1 },
  { dq: -1, dr: 0 },
  { dq: -1, dr: 1 },
  { dq: 0, dr: 1 },
] as const;

const BOARD_KEYS = new Set(generateBoard().map((p) => `${p.q},${p.r}`));

const posKey = (pos: CheckersPosition) => `${pos.q},${pos.r}`;
const samePos = (a: CheckersPosition, b: CheckersPosition) => a.q === b.q && a.r === b.r;
const isInsideBoard = (pos: CheckersPosition) => BOARD_KEYS.has(posKey(pos));
const findPieceAt = (pieces: CheckersPiece[], pos: CheckersPosition) =>
  pieces.find((p) => p.q === pos.q && p.r === pos.r);

/** 把 draft 的位移应用到棋盘上（计算连跳可达性时用这个有效占位） */
function getEffectivePiecesForDraft(
  pieces: CheckersPiece[],
  userId: string,
  draft: CheckersDraftState | null,
): CheckersPiece[] {
  if (!draft) return pieces;
  return pieces.map((piece) => {
    if (piece.playerId === userId && piece.q === draft.original.q && piece.r === draft.original.r) {
      return { ...piece, q: draft.current.q, r: draft.current.r };
    }
    return piece;
  });
}

function isAdjacentMove(from: CheckersPosition, to: CheckersPosition) {
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  return DIRECTIONS.some((dir) => dir.dq === dq && dir.dr === dr);
}

function getLineJumpLandings(occupied: Set<string>, from: CheckersPosition): CheckersPosition[] {
  const landings: CheckersPosition[] = [];

  for (const dir of DIRECTIONS) {
    let cursor: CheckersPosition = { q: from.q + dir.dq, r: from.r + dir.dr };

    // 必须先遇到至少 1 个连续棋子
    if (!isInsideBoard(cursor) || !occupied.has(posKey(cursor))) {
      continue;
    }

    // 沿着同方向跨过连续棋子
    while (isInsideBoard(cursor) && occupied.has(posKey(cursor))) {
      cursor = { q: cursor.q + dir.dq, r: cursor.r + dir.dr };
    }

    // 连续棋子后的第一个空位就是可落点
    if (isInsideBoard(cursor) && !occupied.has(posKey(cursor))) {
      landings.push(cursor);
    }
  }

  return landings;
}

/** 从 draft.current 出发的连跳可达落点（BFS） */
function getReachableJumpTargets(pieces: CheckersPiece[], userId: string, draft: CheckersDraftState) {
  const effectivePieces = getEffectivePiecesForDraft(pieces, userId, draft);
  const occupiedByOthers = new Set(effectivePieces.map((p) => `${p.q},${p.r}`));
  occupiedByOthers.delete(posKey(draft.current));

  const visited = new Set<string>([posKey(draft.current)]);
  const queue: CheckersPosition[] = [draft.current];
  const reachable = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift() as CheckersPosition;
    const landings = getLineJumpLandings(occupiedByOthers, current);
    for (const landing of landings) {
      const landingKey = posKey(landing);
      if (visited.has(landingKey)) continue;

      visited.add(landingKey);
      reachable.add(landingKey);
      queue.push(landing);
    }
  }

  return reachable;
}

// ==================== 游戏 ====================

class Checkers implements Game {
  room: GameRoom;

  constructor({ room }: { room: GameRoom }) {
    this.room = room;
  }

  onInitGame({ room }: { room: GameRoom }) {}

  onStartGame({ room }: { room: GameRoom }) {
    room.register('playerIds', 'public');
    room.register('playerCount', 'public');
    room.register('currentPlayerId', 'public');
    room.register('pieces', 'public');
    room.register('winnerId', 'public');
    room.register('drafts', 'public');
    room.register('targetZones', 'public');
    room.register('latestMove', 'public');
    Object.values(room.users).forEach((user) => {
      user.register('totalScore', 'public');
      user.register('color', 'public');
    });
  }

  // 一局（round）：取前 4 人为玩家，分配起始区/棋色/目标区，其余观战
  onBeforeRoundStart({ room }: { room: GameRoom }) {
    const playerIds = room.userOrder.slice(0, 4);
    room.playerIds = playerIds;
    room.playerCount = playerIds.length;
    const startZoneIndices = getStartZoneIndices(room.playerCount);
    room.pieces = initGame(startZoneIndices);
    room.winnerId = '';
    room.drafts = {};
    room.latestMove = null;

    room.targetZones = {};
    playerIds.forEach((userId, index) => {
      const user = room.users[userId];
      const templatePlayerId = `player${index}`;
      const startZoneIndex = startZoneIndices[index];
      room.targetZones[userId] = getOppositeZoneIndex(startZoneIndex);
      const samplePiece = room.pieces.find((piece) => piece.playerId === templatePlayerId);
      if (user) user.color = samplePiece?.color || '';
      room.pieces.forEach((piece) => {
        if (piece.playerId === templatePlayerId) {
          piece.playerId = userId;
        }
      });
    });
    // 模板 id 已映射完，触发一次赋值标脏
    room.pieces = [...room.pieces];

    Object.values(room.users).forEach((user) => {
      if (!playerIds.includes(user.id)) user.color = '';
    });

    room.currentPlayerId = playerIds[0] || '';
    room.sync();
    return { skip: true };
  }

  // 无前置阶段；轮转顺序取 playerIds[(turn-1) % n]
  onBeforeTurnStart({ room }: { room: GameRoom }) {
    const ids = room.playerIds || [];
    if (ids.length) {
      const index = (Math.max(1, room.turn) - 1) % ids.length;
      room.currentPlayerId = ids[index];
    }
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

  private myDraft(room: GameRoom, userId: string): CheckersDraftState | null {
    return (room.drafts?.[userId] as CheckersDraftState | null) || null;
  }

  private setMyDraft(room: GameRoom, userId: string, draft: CheckersDraftState | null) {
    room.drafts = { ...(room.drafts || {}), [userId]: draft };
  }

  private notify(user: GameUser, message: string) {
    this.room.emitToUser({ user, event: CheckersNoticeEvent, data: { message } });
  }

  private isPlayerWon(room: GameRoom, userId: string) {
    const targetZoneIndex = (room.targetZones || {})[userId];
    if (targetZoneIndex === undefined) return false;

    const targetZone = getStartZones()[targetZoneIndex] || [];
    const targetSet = new Set(targetZone.map(posKey));
    const userPieces = (room.pieces || []).filter((piece) => piece.playerId === userId);
    if (userPieces.length !== 10) return false;

    return userPieces.every((piece) => targetSet.has(posKey(piece)));
  }

  // 点选流程与旧版一致：选子 → 相邻步/连跳落点 → 再点同一落点确认；
  // 普通步后不能续走，跳后可以连跳
  private onClick({
    room,
    user,
    data,
    ctx,
  }: {
    room: GameRoom;
    user: GameUser;
    data: { q?: number; r?: number };
    ctx?: PhaseCtx;
  }) {
    if (!room.isGamePlaying() || !room.checkPhase(ctx, { turnStatus: ['ing'] })) return;
    if (room.currentPlayerId !== user.id || room.winnerId) return;

    const target: CheckersPosition = { q: Number(data?.q), r: Number(data?.r) };
    if (!Number.isInteger(target.q) || !Number.isInteger(target.r) || !isInsideBoard(target)) {
      return;
    }

    const currentDraft = this.myDraft(room, user.id);
    const effectivePieces = getEffectivePiecesForDraft(room.pieces, user.id, currentDraft);
    const targetPiece = findPieceAt(effectivePieces, target);

    if (!currentDraft) {
      if (!targetPiece || targetPiece.playerId !== user.id) {
        this.notify(user, '请先点击自己的棋子');
        return;
      }
      this.setMyDraft(room, user.id, {
        original: { q: target.q, r: target.r },
        current: { q: target.q, r: target.r },
        moveKind: 'none',
      });
      room.sync();
      return;
    }

    // 已有预走落点：再点同一落点 = 确认
    if (currentDraft.moveKind !== 'none' && samePos(target, currentDraft.current)) {
      this.confirm({ room, user, ctx });
      return;
    }

    // 已经发生位移后，不能切换棋子
    if (
      targetPiece &&
      targetPiece.playerId === user.id &&
      !samePos(target, currentDraft.current)
    ) {
      if (currentDraft.moveKind !== 'none') {
        this.notify(user, '已移动，不能切换棋子');
        return;
      }
      this.setMyDraft(room, user.id, {
        original: { q: target.q, r: target.r },
        current: { q: target.q, r: target.r },
        moveKind: 'none',
      });
      room.sync();
      return;
    }

    if (targetPiece) {
      this.notify(user, '目标位置有棋子');
      return;
    }

    if (currentDraft.moveKind === 'step') {
      this.notify(user, '普通移动后不能继续移动');
      return;
    }

    if (isAdjacentMove(currentDraft.current, target)) {
      if (currentDraft.moveKind === 'jump') {
        this.notify(user, '跳跃后不能普通移动');
        return;
      }
      this.setMyDraft(room, user.id, {
        original: currentDraft.original,
        current: target,
        moveKind: 'step',
      });
      room.sync();
      return;
    }

    const reachable = getReachableJumpTargets(room.pieces, user.id, currentDraft);
    if (!reachable.has(posKey(target))) {
      this.notify(user, '不能到达');
      return;
    }

    this.setMyDraft(room, user.id, {
      original: currentDraft.original,
      current: target,
      moveKind: 'jump',
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
      this.notify(user, '没有可确认的移动');
      return;
    }

    const piece = room.pieces.find(
      (p) => p.playerId === user.id && p.q === draft.original.q && p.r === draft.original.r,
    );
    if (!piece) {
      this.setMyDraft(room, user.id, null);
      room.sync();
      return;
    }

    const from = { ...draft.original };
    const to = { ...draft.current };
    const targetOccupied = room.pieces.some(
      (p) => p !== piece && p.q === to.q && p.r === to.r,
    );
    if (targetOccupied || !isInsideBoard(to)) {
      this.notify(user, '目标位置无效');
      return;
    }

    if (draft.moveKind === 'step') {
      if (!isAdjacentMove(from, to)) {
        this.notify(user, '移动不合法');
        return;
      }
    } else if (draft.moveKind === 'jump') {
      // 从源点整体校验该落点是否可达（连跳路径合法）
      const reachable = getReachableJumpTargets(room.pieces, user.id, {
        original: from,
        current: from,
        moveKind: 'none',
      });
      if (!reachable.has(posKey(to))) {
        this.notify(user, '跳跃不合法');
        return;
      }
    }

    piece.q = to.q;
    piece.r = to.r;
    // AutoSyncData 只在属性赋值时标脏：必须换新数组，sync 才会把新棋盘带给客户端
    room.pieces = [...room.pieces];
    room.latestMove = { q: to.q, r: to.r };
    this.setMyDraft(room, user.id, null);

    if (this.isPlayerWon(room, user.id)) {
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
      case CheckersCustomMsgTypes.Click:
        this.onClick({ room, user, data, ctx });
        break;
      case CheckersCustomMsgTypes.Confirm:
        this.confirm({ room, user, ctx });
        break;
      case CheckersCustomMsgTypes.Cancel:
        this.onCancel({ room, user });
        break;
      default:
        console.error('Unknown checkers message type:', type);
    }
  }
}

export default Checkers;
