<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Socket } from 'socket.io-client'
import GameBoard from '@/components/GameBoard.vue'
import Btn from '@/components/Btn.vue'
import { Coord } from 'shared/types/game'
import {
  GOMOKU_BOARD_SIZE,
  GomokuCustomMsgTypes,
  IGomokuRoom,
} from 'shared/types/games/gomoku'

const CANVAS_SIZE = 350
const CELL = CANVAS_SIZE / (GOMOKU_BOARD_SIZE + 1)
const STONE_RADIUS = CELL * 0.36
const STAR_POINTS: [number, number][] = [
  [3, 3], [11, 3], [7, 7], [3, 11], [11, 11],
]
const STONE_ANIMATION_DURATION = 500

const { room, userId, socket } = defineProps<{
  room: IGomokuRoom
  userId: string
  socket: Socket
}>()

const GameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null)

const canPlace = computed(
  () =>
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    !room.winnerId &&
    !room.isDraw &&
    room.currentPlayerId === userId
)

// ==================== 绘制 ====================

// 最新一手棋出现的时间，用于落子动画进度
const lastMoveAt = ref(0)
let renderFrame: number | null = null

watch(() => room.lastMove, (next, prev) => {
  if (next && next !== prev) lastMoveAt.value = Date.now()
}, { immediate: true })

/** 移植自旧版五子棋的棋子绘制：径向渐变 + 投影，最新一手带落子动画和重阴影 */
const drawStone = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: 'black' | 'white',
  options: { latest?: boolean; preview?: boolean; animationProgress?: number } = {},
) => {
  const centerX = CELL * (x + 1)
  const centerY = CELL * (y + 1)

  // 预选棋子：半透明
  if (options.preview) {
    ctx.save()
    ctx.globalAlpha = color === 'black' ? 0.2 : 0.4
    ctx.beginPath()
    ctx.arc(centerX, centerY, STONE_RADIUS, 0, Math.PI * 2)
    const previewGradient = ctx.createRadialGradient(
      centerX - STONE_RADIUS * 0.3, centerY - STONE_RADIUS * 0.3, STONE_RADIUS * 0.15,
      centerX, centerY, STONE_RADIUS,
    )
    previewGradient.addColorStop(0, color === 'black' ? '#666' : '#fff')
    previewGradient.addColorStop(1, color === 'black' ? '#111' : '#f0f0f0')
    ctx.fillStyle = previewGradient
    ctx.fill()
    ctx.restore()
    return
  }

  // 落子动画：从右下角向左上轻微位移（ease-out）
  let offsetX = 0
  let offsetY = 0
  const progress = options.animationProgress ?? 1
  if (options.latest && progress < 1) {
    const eased = 1 - Math.pow(1 - progress, 3)
    offsetX = (1 - eased) * CELL * 0.17
    offsetY = (1 - eased) * CELL * 0.11
  }
  const actualX = centerX + offsetX
  const actualY = centerY + offsetY

  ctx.save()
  ctx.beginPath()
  ctx.arc(actualX, actualY, STONE_RADIUS, 0, Math.PI * 2)
  const gradient = ctx.createRadialGradient(
    actualX - STONE_RADIUS * 0.3, actualY - STONE_RADIUS * 0.3, STONE_RADIUS * 0.15,
    actualX, actualY, STONE_RADIUS,
  )
  if (color === 'black') {
    gradient.addColorStop(0, '#666')
    gradient.addColorStop(1, '#111')
  } else {
    gradient.addColorStop(0, '#fff')
    gradient.addColorStop(1, '#f0f0f0')
  }
  ctx.fillStyle = gradient

  // 最新棋子：更重的投影，随动画进度浮现
  if (options.latest) {
    ctx.shadowColor = `rgba(0, 0, 0, ${(color === 'black' ? 0.7 : 0.6) * progress})`
    ctx.shadowBlur = 18
    ctx.shadowOffsetX = 5
    ctx.shadowOffsetY = 8
  } else {
    ctx.shadowColor = color === 'black' ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.18)'
    ctx.shadowBlur = 4
    ctx.shadowOffsetY = 2
  }
  ctx.fill()
  ctx.restore()

  if (color === 'white') {
    ctx.save()
    ctx.beginPath()
    ctx.arc(actualX, actualY, STONE_RADIUS, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
}

const drawBoard = () => {
  GameBoardRef.value?.draw((ctx) => {
    // 棋盘底色（旧版配色）
    ctx.fillStyle = '#e6c37b'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 网格线
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)'
    ctx.lineWidth = 1
    for (let i = 0; i < GOMOKU_BOARD_SIZE; i += 1) {
      const p = CELL * (i + 1)
      ctx.beginPath()
      ctx.moveTo(CELL, p)
      ctx.lineTo(CANVAS_SIZE - CELL, p)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(p, CELL)
      ctx.lineTo(p, CANVAS_SIZE - CELL)
      ctx.stroke()
    }

    // 星位
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
    for (const [sx, sy] of STAR_POINTS) {
      ctx.beginPath()
      ctx.arc(CELL * (sx + 1), CELL * (sy + 1), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // 最新一手的动画进度
    const latest = room.lastMove
    let animationProgress = 1
    if (latest && lastMoveAt.value) {
      animationProgress = Math.max(
        0,
        Math.min(1, (Date.now() - lastMoveAt.value) / STONE_ANIMATION_DURATION),
      )
    }
    const animating = animationProgress < 1

    // 棋子
    const board = room.board || []
    for (let y = 0; y < GOMOKU_BOARD_SIZE; y += 1) {
      for (let x = 0; x < GOMOKU_BOARD_SIZE; x += 1) {
        const cell = board[y * GOMOKU_BOARD_SIZE + x]
        if (!cell) continue
        const isLatest = !!latest && latest.x === x && latest.y === y
        drawStone(ctx, x, y, cell, {
          latest: isLatest,
          animationProgress: isLatest ? animationProgress : undefined,
        })
      }
    }

    // 预选棋子（半透明，待确认）
    if (pendingCell.value && myStoneColor.value) {
      drawStone(ctx, pendingCell.value.x, pendingCell.value.y, myStoneColor.value as 'black' | 'white', {
        preview: true,
      })
    }

    // 动画未结束时继续渲染下一帧
    if (animating && renderFrame == null) {
      renderFrame = requestAnimationFrame(() => {
        renderFrame = null
        drawBoard()
      })
    }
  })
}

// ==================== 落子（先预选再确认，防误触） ====================

const pendingCell = ref<{ x: number; y: number } | null>(null)

const myStoneColor = computed(() => {
  if (room.blackUserId === userId) return 'black'
  if (room.whiteUserId === userId) return 'white'
  return ''
})

const confirmPending = () => {
  if (!pendingCell.value || !canPlace.value) return
  socket.emit(GomokuCustomMsgTypes.PlaceStone, pendingCell.value)
  pendingCell.value = null
}
const cancelPending = () => {
  pendingCell.value = null
}

const onPointerDown = (coord: Coord) => {
  if (!canPlace.value) return
  const x = Math.round(coord.x / CELL - 1)
  const y = Math.round(coord.y / CELL - 1)
  if (x < 0 || x >= GOMOKU_BOARD_SIZE || y < 0 || y >= GOMOKU_BOARD_SIZE) return
  if (room.board[y * GOMOKU_BOARD_SIZE + x]) return

  // 再点一次同一个格子 = 确认
  if (pendingCell.value?.x === x && pendingCell.value?.y === y) {
    confirmPending()
    return
  }
  pendingCell.value = { x, y }
}

// ==================== lifecycle ====================

watch(
  () => [room.board, room.lastMove, room.currentPlayerId, room.status, room.roundStatus, room.winnerId, room.isDraw],
  () => {
    // 轮次或棋盘变化后，残留的预选作废
    if (pendingCell.value && (!canPlace.value || room.board[pendingCell.value.y * GOMOKU_BOARD_SIZE + pendingCell.value.x])) {
      pendingCell.value = null
    }
    drawBoard()
  },
  { immediate: true, deep: false }
)
watch(pendingCell, () => drawBoard())
onMounted(() => {
  // immediate watch 在子组件挂载前执行过一次空绘制，这里补上首帧
  drawBoard()
})
onUnmounted(() => {
  if (renderFrame != null) cancelAnimationFrame(renderFrame)
})
</script>

<template>
  <!-- 只在准备态隐藏：游戏中、局末结算（settlement，还在看战绩）都保留棋盘 -->
  <div v-if="room.status !== 'waiting'" class="gomoku">
    <div v-if="room.winnerId" class="bar result">
      {{ room.users[room.winnerId]?.name || '' }} 获胜 🎉
    </div>
    <div v-else-if="room.isDraw" class="bar result">平局 🤝</div>

    <div class="board-wrap">
      <GameBoard
        :width="CANVAS_SIZE"
        :height="CANVAS_SIZE"
        :background="'#e6c37b'"
        ref="GameBoardRef"
        :allow-panning="true"
        :allow-pinching="true"
        :highlight="canPlace"
        @pointerdown="onPointerDown"
      >
        <!-- 确认/取消走 board 右侧控制插槽，和 fitwindow 同行，不再叠住它 -->
        <template #control-right v-if="pendingCell && canPlace">
          <Btn small @click="cancelPending">取消</Btn>
          <Btn small type="primary" @click="confirmPending">确认</Btn>
        </template>
      </GameBoard>
    </div>
  </div>
</template>

<style lang="less" scoped>
.gomoku {
  .bar {
    margin: 2px 0 6px 0;
    color: var(--text);
    font-size: 14px;
    text-align: left;

    .bold {
      font-weight: bold;
    }
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
