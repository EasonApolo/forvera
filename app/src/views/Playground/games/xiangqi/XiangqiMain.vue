<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Socket } from 'socket.io-client'
import GameBoard from '@/components/GameBoard.vue'
import Btn from '@/components/Btn.vue'
import { useToastStore } from '@/store/toast'
import { Coord } from 'shared/types/game'
import {
  XIANGQI_COLS,
  XIANGQI_ROWS,
  IXiangqiRoom,
  XiangqiCustomMsgTypes,
  XiangqiNoticeEvent,
  XiangqiPieceType,
} from 'shared/types/games/xiangqi'

// 棋盘 9 列 x 10 路，棋子下在交叉点上
const CELL = 44
const PADDING = 24
const BOARD_W = (XIANGQI_COLS - 1) * CELL + PADDING * 2
const BOARD_H = (XIANGQI_ROWS - 1) * CELL + PADDING * 2
const KAITI_FONT = "'Kaiti SC', 'Kaiti TC', 'STKaiti', 'BiauKai', 'DFKai-SB', 'KaiTi', serif"

const { room, userId, socket } = defineProps<{
  room: IXiangqiRoom
  userId: string
  socket: Socket
}>()

const toastStore = useToastStore()
const GameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null)

// 黑方视角棋盘旋转 180°（和白方看到的上下相反）
const isBlackSide = computed(() => room.blackUserId === userId)
const toViewPos = (x: number, y: number) =>
  isBlackSide.value ? { x: XIANGQI_COLS - 1 - x, y: XIANGQI_ROWS - 1 - y } : { x, y }
const toWorldPos = (x: number, y: number) =>
  isBlackSide.value ? { x: XIANGQI_COLS - 1 - x, y: XIANGQI_ROWS - 1 - y } : { x, y }

const myDraft = computed(() => (room.drafts?.[userId] as any) || null)

const PIECE_LABEL: Record<XiangqiPieceType, { black: string; white: string }> = {
  rook: { black: '車', white: '車' },
  horse: { black: '馬', white: '馬' },
  elephant: { black: '象', white: '相' },
  advisor: { black: '士', white: '仕' },
  general: { black: '將', white: '帥' },
  cannon: { black: '砲', white: '砲' },
  soldier: { black: '卒', white: '兵' },
}

// ==================== 绘制（移植自旧版 GomokuRoom 的象棋棋盘） ====================

const drawPiece = (
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  side: 'black' | 'white',
  pieceType: XiangqiPieceType,
  alpha = 1,
  latest = false,
) => {
  const viewPos = toViewPos(col, row)
  const x = PADDING + viewPos.x * CELL
  const y = PADDING + viewPos.y * CELL
  const radius = CELL * 0.34
  const text = PIECE_LABEL[pieceType][side]

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, Math.PI * 2)
  const gradient = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, radius)
  if (side === 'black') {
    gradient.addColorStop(0, '#5b5b5b')
    gradient.addColorStop(1, '#1e1e1e')
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fillStyle = gradient
  } else {
    gradient.addColorStop(0, '#fffaf1')
    gradient.addColorStop(1, '#f2e6d2')
    ctx.strokeStyle = 'rgba(120, 72, 21, 0.45)'
    ctx.fillStyle = gradient
  }
  ctx.lineWidth = 1.2

  if (latest) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.68)'
    ctx.shadowBlur = 16
    ctx.shadowOffsetX = 5
    ctx.shadowOffsetY = 8
  } else {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.26)'
    ctx.shadowBlur = 5
    ctx.shadowOffsetY = 3
  }

  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = side === 'black' ? '#f7f7f7' : '#a32d10'
  ctx.font = `700 22px ${KAITI_FONT}`
  const metrics = ctx.measureText(text)
  const ascent = metrics.actualBoundingBoxAscent || 11
  const descent = metrics.actualBoundingBoxDescent || 11
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x - metrics.width / 2, y + (ascent - descent) / 2)
  ctx.restore()
}

const drawBoard = () => {
  GameBoardRef.value?.draw((ctx) => {
    const left = PADDING
    const top = PADDING
    const right = left + (XIANGQI_COLS - 1) * CELL
    const bottom = top + (XIANGQI_ROWS - 1) * CELL

    ctx.clearRect(0, 0, BOARD_W, BOARD_H)
    ctx.fillStyle = '#e7c98e'
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)

    ctx.strokeStyle = '#6f4c28'
    ctx.lineWidth = 2
    ctx.strokeRect(left, top, right - left, bottom - top)

    ctx.strokeStyle = 'rgba(92, 61, 26, 0.9)'
    ctx.lineWidth = 1.3

    // 横线（10 路）
    for (let row = 0; row < XIANGQI_ROWS; row += 1) {
      const y = top + row * CELL + 0.5
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
    }

    // 竖线（9 列），中间留楚河漢界
    const riverTopY = top + 4 * CELL
    const riverBottomY = top + 5 * CELL
    for (let col = 0; col < XIANGQI_COLS; col += 1) {
      const x = left + col * CELL + 0.5
      ctx.beginPath()
      if (col === 0 || col === XIANGQI_COLS - 1) {
        ctx.moveTo(x, top)
        ctx.lineTo(x, bottom)
      } else {
        ctx.moveTo(x, top)
        ctx.lineTo(x, riverTopY)
        ctx.moveTo(x, riverBottomY)
        ctx.lineTo(x, bottom)
      }
      ctx.stroke()
    }

    // 九宫斜线
    const palaceLeft = left + 3 * CELL
    const palaceRight = left + 5 * CELL
    const palaceTopBottom = top + 2 * CELL
    const palaceBottomTop = top + 7 * CELL
    ctx.beginPath()
    ctx.moveTo(palaceLeft, top)
    ctx.lineTo(palaceRight, palaceTopBottom)
    ctx.moveTo(palaceRight, top)
    ctx.lineTo(palaceLeft, palaceTopBottom)
    ctx.moveTo(palaceLeft, palaceBottomTop)
    ctx.lineTo(palaceRight, bottom)
    ctx.moveTo(palaceRight, palaceBottomTop)
    ctx.lineTo(palaceLeft, bottom)
    ctx.stroke()

    // 楚河漢界（竖排字，不随视角旋转）
    ctx.save()
    ctx.fillStyle = 'rgba(92, 61, 26, 0.85)'
    ctx.font = `700 24px ${KAITI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const riverMidY = (riverTopY + riverBottomY) / 2
    const leftRiverX = left + 2 * CELL
    const rightRiverX = left + 6 * CELL
    const drawVerticalRiverText = (text: string, centerX: number, centerY: number, rotateRad: number) => {
      const chars = Array.from(text)
      const lineHeight = 24
      const startY = -((chars.length - 1) * lineHeight) / 2
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(rotateRad)
      chars.forEach((char, index) => {
        ctx.fillText(char, 0, startY + index * lineHeight)
      })
      ctx.restore()
    }
    drawVerticalRiverText('楚河', leftRiverX, riverMidY, Math.PI / 2)
    drawVerticalRiverText('漢界', rightRiverX, riverMidY, -Math.PI / 2)
    ctx.restore()

    // 棋子：被预选的源点位置不画实体子（由 ghost 代替）
    const draftEntries = Object.entries(room.drafts || {}).filter(([, draft]) => Boolean(draft)) as Array<
      [string, any]
    >
    const draftOriginalSet = new Set(
      draftEntries.map(([, draft]) => `${draft.original.x},${draft.original.y}`),
    )

    const pieces = room.pieces || []
    pieces.forEach((piece) => {
      if (draftOriginalSet.has(`${piece.x},${piece.y}`)) return
      const isLatest = !!room.latestMove && room.latestMove.x === piece.x && room.latestMove.y === piece.y
      drawPiece(ctx, piece.x, piece.y, piece.color, piece.type, 1, isLatest)
    })

    // 所有玩家的预走 ghost（自己更实一点）
    draftEntries.forEach(([draftUserId, draft]) => {
      const source = pieces.find(
        (piece) => piece.x === draft.original.x && piece.y === draft.original.y,
      )
      if (!source) return
      const isMine = draftUserId === userId
      const alpha = draft.moveKind === 'none' ? (isMine ? 0.38 : 0.28) : isMine ? 0.62 : 0.5
      drawPiece(ctx, draft.current.x, draft.current.y, source.color, source.type, alpha, false)
    })
  })
}

// ==================== 点选走子 ====================

const canOperate = computed(
  () =>
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    !room.winnerId &&
    room.currentPlayerId === userId,
)

const onPointerDown = (coord: Coord) => {
  if (!canOperate.value) return
  const colFloat = (coord.x - PADDING) / CELL
  const rowFloat = (coord.y - PADDING) / CELL
  const x = Math.round(colFloat)
  const y = Math.round(rowFloat)
  if (x < 0 || x >= XIANGQI_COLS || y < 0 || y >= XIANGQI_ROWS) return
  // 要求点击位置接近交叉点，避免误触
  if (Math.abs(colFloat - x) > 0.4 || Math.abs(rowFloat - y) > 0.4) return
  const world = toWorldPos(x, y)
  socket.emit(XiangqiCustomMsgTypes.Click, { x: world.x, y: world.y })
}

const confirmDraft = () => {
  if (!myDraft.value) return
  socket.emit(XiangqiCustomMsgTypes.Confirm, undefined)
}
const cancelDraft = () => {
  if (!myDraft.value) return
  socket.emit(XiangqiCustomMsgTypes.Cancel, undefined)
}

// 规则错误等私密提示（服务端 emitToUser 单发）
const onNotice = (data: { message?: string }) => {
  if (data?.message) toastStore.showToast({ content: data.message, type: '!' })
}

// ==================== lifecycle ====================

watch(
  () => [room.pieces, room.drafts, room.latestMove, room.status, room.roundStatus, room.winnerId],
  () => drawBoard(),
  { immediate: true, deep: false },
)
onMounted(() => {
  socket.on(XiangqiNoticeEvent, onNotice)
  // immediate watch 在子组件挂载前执行过一次空绘制，这里补上首帧
  drawBoard()
})
onUnmounted(() => {
  socket.off(XiangqiNoticeEvent, onNotice)
})
</script>

<template>
  <!-- 只在准备态隐藏：游戏中、局末结算（settlement，还在看战绩）都保留棋盘 -->
  <div v-if="room.status !== 'waiting'" class="xiangqi">
    <div v-if="room.winnerId" class="bar result">
      {{ room.users[room.winnerId]?.name || '' }} 获胜 🎉
    </div>

    <div class="board-wrap">
      <GameBoard
        :width="BOARD_W"
        :height="BOARD_H"
        :background="'#e7c98e'"
        ref="GameBoardRef"
        :allow-panning="true"
        :allow-pinching="true"
        :highlight="canOperate"
        @pointerdown="onPointerDown"
      >
        <!-- 确认/取消走 board 右侧控制插槽，和 fitwindow 同行，不叠住它 -->
        <template
          #control-right
          v-if="myDraft && myDraft.moveKind !== 'none' && canOperate"
        >
          <Btn small @click="cancelDraft">取消</Btn>
          <Btn small type="primary" @click="confirmDraft">确认</Btn>
        </template>
      </GameBoard>
    </div>
  </div>
</template>

<style lang="less" scoped>
.xiangqi {
  .bar {
    margin: 2px 0 6px 0;
    color: var(--text);
    font-size: 14px;
    text-align: left;
  }

  .result {
    font-weight: bold;
    color: var(--primary-color);
  }

  .board-wrap {
    position: relative;
  }
}
</style>
