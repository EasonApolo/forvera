<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Socket } from 'socket.io-client'
import GameBoard from '@/components/GameBoard.vue'
import Btn from '@/components/Btn.vue'
import { useToastStore } from '@/store/toast'
import { Coord } from 'shared/types/game'
import {
  ICheckersRoom,
  CheckersColor,
  CheckersCustomMsgTypes,
  CheckersNoticeEvent,
  CheckersPosition,
} from 'shared/types/games/checkers'

// 三向坐标六角跳棋棋盘（平顶六边形）
const CELL = 28
const TRIANGLE_EDGE = Math.sqrt(3) * CELL
const TRIANGLE_HEIGHT = (Math.sqrt(3) / 2) * TRIANGLE_EDGE // = CELL * 1.5
const PADDING = 24
const BOARD_W = Math.ceil(12 * TRIANGLE_EDGE + PADDING * 2)
const BOARD_H = Math.ceil(16 * TRIANGLE_HEIGHT + PADDING * 2)
const CENTER_X = BOARD_W / 2
const CENTER_Y = BOARD_H / 2

const { room, userId, socket } = defineProps<{
  room: ICheckersRoom
  userId: string
  socket: Socket
}>()

const toastStore = useToastStore()
const GameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null)

const OPPOSITE_ZONE: Record<number, number> = { 0: 3, 1: 4, 2: 5, 3: 0, 4: 1, 5: 2 }
const getOppositeZoneIndex = (zoneIndex: number) => OPPOSITE_ZONE[zoneIndex] ?? zoneIndex

/** 视角旋转：把自己的起始区转到下方（旧版 GomokuRoom 同款逻辑） */
const myStartZone = computed(() => {
  const targetZone = (room.targetZones || {})[userId]
  if (targetZone === undefined) return 3
  return getOppositeZoneIndex(targetZone)
})
const rotationSteps = computed(() => {
  const stepsToBottom: Record<number, number> = {
    0: 3,
    1: 4,
    2: 5,
    3: 0,
    4: 1,
    5: 2,
  }
  return stepsToBottom[myStartZone.value] ?? 0
})

const myDraft = computed(() => (room.drafts?.[userId] as any) || null)

const rotatePos = (pos: CheckersPosition, steps: number): CheckersPosition => {
  let q = pos.q
  let r = pos.r
  let s = -q - r
  const normalized = ((steps % 6) + 6) % 6
  for (let i = 0; i < normalized; i += 1) {
    const nextQ = -r
    const nextR = -s
    const nextS = -q
    q = nextQ
    r = nextR
    s = nextS
  }
  return { q, r }
}

const generateBoardPoints = (): Array<{ q: number; r: number }> => {
  const points: Array<{ q: number; r: number }> = []
  for (let r = -4; r <= 4; r++) {
    for (let q = Math.max(-4, -r - 4); q <= Math.min(4, -r + 4); q++) {
      points.push({ q, r })
    }
  }
  for (let r = -8; r <= -5; r++) {
    for (let q = -r - 4; q <= 4; q++) {
      points.push({ q, r })
    }
  }
  for (let q = 5; q <= 8; q++) {
    for (let r = -4; r <= 4 - q; r++) {
      points.push({ q, r })
    }
  }
  for (let s = -8; s <= -5; s++) {
    for (let q = -s - 4; q <= 4; q++) {
      points.push({ q, r: -q - s })
    }
  }
  for (let r = 5; r <= 8; r++) {
    for (let q = -4; q <= 4 - r; q++) {
      points.push({ q, r })
    }
  }
  for (let q = -8; q <= -5; q++) {
    for (let r = -q - 4; r <= 4; r++) {
      points.push({ q, r })
    }
  }
  for (let s = 5; s <= 8; s++) {
    for (let q = -4; q <= 4 - s; q++) {
      points.push({ q, r: -q - s })
    }
  }
  return points
}
const BOARD_POINTS = generateBoardPoints()

// 平顶六边形：三向坐标 → 像素（相对画布中心）
const hexToPixel = (q: number, r: number) => {
  const x = CELL * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + CENTER_X
  const y = CELL * 1.5 * r + CENTER_Y
  return { x, y }
}

const lightenColor = (color: string, amt: number) => {
  const num = parseInt(color.slice(1), 16)
  const R = Math.min(255, (num >> 16) + amt)
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt)
  const B = Math.min(255, (num & 0x0000ff) + amt)
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1).toUpperCase()}`
}

// ==================== 绘制（移植自旧版 GomokuRoom 的跳棋棋盘） ====================

const drawBoard = () => {
  GameBoardRef.value?.draw((ctx) => {
    ctx.clearRect(0, 0, BOARD_W, BOARD_H)
    ctx.fillStyle = '#f4e4c1'
    ctx.fillRect(0, 0, BOARD_W, BOARD_H)

    const toViewPos = (pos: CheckersPosition): CheckersPosition =>
      rotatePos(pos, rotationSteps.value)

    // 连线
    ctx.strokeStyle = 'rgba(139, 69, 19, 0.2)'
    ctx.lineWidth = 1.5
    BOARD_POINTS.forEach((point) => {
      const viewPoint = toViewPos(point)
      const { x, y } = hexToPixel(viewPoint.q, viewPoint.r)
      const neighbors = [
        { q: point.q + 1, r: point.r },
        { q: point.q + 1, r: point.r - 1 },
        { q: point.q, r: point.r + 1 },
      ]
      neighbors.forEach((neighbor) => {
        // 只画一次线（从 q/r 较小的指向较大的）
        const exists = BOARD_POINTS.some((p) => p.q === neighbor.q && p.r === neighbor.r)
        if (!exists) return
        const viewNeighbor = toViewPos(neighbor)
        const { x: x2, y: y2 } = hexToPixel(viewNeighbor.q, viewNeighbor.r)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      })
    })

    // 点位
    ctx.fillStyle = 'rgba(139, 69, 19, 0.35)'
    BOARD_POINTS.forEach((point) => {
      const viewPoint = toViewPos(point)
      const { x, y } = hexToPixel(viewPoint.q, viewPoint.r)
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill()
    })

    // 棋子
    const colorMap: Record<CheckersColor, string> = {
      yellow: '#FFD700',
      blue: '#4169E1',
      red: '#DC143C',
    }

    const draftEntries = Object.entries(room.drafts || {}).filter(([, draft]) => Boolean(draft)) as Array<
      [string, any]
    >
    const draftOriginalSet = new Set(
      draftEntries.map(([, draft]) => `${draft.original.q},${draft.original.r}`),
    )

    const drawCheckerPiece = (
      piece: { q: number; r: number; color: CheckersColor },
      alpha = 1,
      latest = false,
    ) => {
      const viewPiece = toViewPos(piece)
      const { x, y } = hexToPixel(viewPiece.q, viewPiece.r)
      const radius = 13

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)

      const gradient = ctx.createRadialGradient(x - 4, y - 4, 2, x, y, radius)
      const baseColor = colorMap[piece.color]
      gradient.addColorStop(0, lightenColor(baseColor, 30))
      gradient.addColorStop(1, baseColor)
      ctx.fillStyle = gradient

      if (latest) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)'
        ctx.shadowBlur = 16
        ctx.shadowOffsetX = 5
        ctx.shadowOffsetY = 8
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetY = 3
      }

      ctx.fill()
      ctx.restore()
    }

    const pieces = room.pieces || []
    pieces.forEach((piece) => {
      if (draftOriginalSet.has(`${piece.q},${piece.r}`)) return
      const isLatest =
        !!room.latestMove && room.latestMove.q === piece.q && room.latestMove.r === piece.r
      drawCheckerPiece(piece, 1, isLatest)
    })

    // 所有玩家的预走 ghost（自己更实一点）
    draftEntries.forEach(([draftUserId, draft]) => {
      const draftPiece = pieces.find(
        (piece) => piece.q === draft.original.q && piece.r === draft.original.r,
      )
      const draftOwner = (room.users || {})[draftUserId]
      const draftColor = (draftPiece?.color || draftOwner?.color) as CheckersColor | undefined
      if (!draftColor) return
      const isMine = draftUserId === userId
      drawCheckerPiece({ q: draft.current.q, r: draft.current.r, color: draftColor }, isMine ? 0.45 : 0.35)
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
  // 像素 → 三向坐标（相对中心），再取整
  const x = coord.x - CENTER_X
  const y = coord.y - CENTER_Y
  const qf = ((Math.sqrt(3) / 3) * x - y / 3) / CELL
  const rf = ((2 / 3) * y) / CELL
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  const s = Math.round(sf)
  const qDiff = Math.abs(q - qf)
  const rDiff = Math.abs(r - rf)
  const sDiff = Math.abs(s - sf)
  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s
  } else if (rDiff > sDiff) {
    r = -q - s
  }
  const world = rotatePos({ q, r }, 6 - rotationSteps.value)
  const isValid = BOARD_POINTS.some((pos) => pos.q === world.q && pos.r === world.r)
  if (!isValid) return
  socket.emit(CheckersCustomMsgTypes.Click, { q: world.q, r: world.r })
}

const confirmDraft = () => {
  if (!myDraft.value) return
  socket.emit(CheckersCustomMsgTypes.Confirm, undefined)
}
const cancelDraft = () => {
  if (!myDraft.value) return
  socket.emit(CheckersCustomMsgTypes.Cancel, undefined)
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
watch(rotationSteps, () => drawBoard())
onMounted(() => {
  socket.on(CheckersNoticeEvent, onNotice)
  // immediate watch 在子组件挂载前执行过一次空绘制，这里补上首帧
  drawBoard()
})
onUnmounted(() => {
  socket.off(CheckersNoticeEvent, onNotice)
})
</script>

<template>
  <!-- 只在准备态隐藏：游戏中、局末结算（settlement，还在看战绩）都保留棋盘 -->
  <div v-if="room.status !== 'waiting'" class="checkers">
    <div v-if="room.winnerId" class="bar result">
      {{ room.users[room.winnerId]?.name || '' }} 获胜 🎉
    </div>

    <div class="board-wrap">
      <GameBoard
        :width="BOARD_W"
        :height="BOARD_H"
        :background="'#f4e4c1'"
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
.checkers {
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
