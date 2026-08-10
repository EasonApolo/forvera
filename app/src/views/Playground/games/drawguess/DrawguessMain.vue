<script setup lang="ts">
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import GameBoard from '@/components/GameBoard.vue'
import Modal from '@/components/Modal.vue'
import { Coord, IGameRoom, WsCustomMsg, WsCustomMsgName, WsEventMsg } from 'shared/types/game'
import {
  DrawGuessCustomMsgTypes,
  DrawGuessDurations,
  IDrawGuessRoom,
  StrokeChunk,
  SyncStrokeDTO,
} from 'shared/types/games/drawguess'
import { displayTime } from 'shared/utils'
import { Socket } from 'socket.io-client'
import { computed, nextTick, onMounted, onUnmounted, Ref, ref, watch } from 'vue'

const { room, userId, socket } = defineProps<{
  room: IDrawGuessRoom
  userId: string
  socket: Socket
}>()

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600

const COLOR_OPTIONS = ['#000000', '#ff4d4f', '#faad14', '#13c2c2', '#52c41a', '#1890ff', '#722ed1']
const LINE_WIDTH_OPTIONS = [1, 3, 5, 10]

const GameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null)
const imDrawer = computed(() => room.drawerId === userId)
const imDrawing = computed(() => imDrawer.value && room.turnStatus === 'ing')
const canDraw = computed(() => imDrawer.value && room.turnStatus === 'ing')

// ==================== 颜色/粗细选择 ====================

const selectedColor = ref(COLOR_OPTIONS[0])
const selectedLineWidth = ref(LINE_WIDTH_OPTIONS[1])

// ==================== 动作映射到绘制 ====================

const currentStrokes: StrokeChunk[] = []
let currentStrokeId = 0 // 用于后续连接
let lastPoint: Coord | null = null // 用于画线

const onPointerDown = (coord: Coord) => {
  if (!canDraw.value) return

  const newStrokeId = Date.now()
  currentStrokeId = newStrokeId
  const newStroke = {
    id: newStrokeId,
    color: selectedColor.value,
    width: selectedLineWidth.value,
    points: [[coord.x, coord.y]] as [number, number][],
  }
  currentStrokes.push(newStroke)
  lastPoint = coord
}
const onPointerMove = (coord: Coord) => {
  if (!canDraw.value) {
    if (lastPoint) {
      // 如果画到一半时间到不能画了
      lastPoint = null
    }
    return
  }

  let currentStroke = currentStrokes.at(-1)
  if (currentStroke) {
    currentStroke.points.push([coord.x, coord.y])
  } else {
    currentStroke = {
      id: currentStrokeId,
      color: selectedColor.value,
      width: selectedLineWidth.value,
      points: [[coord.x, coord.y]] as [number, number][],
    }
    currentStrokes.push(currentStroke)
  }
  if (lastPoint) {
    drawLine(lastPoint, coord, selectedColor.value, selectedLineWidth.value)
  }
  lastPoint = coord
}
const onPointerUp = (coord: Coord) => {
  if (!canDraw.value) {
    if (lastPoint) {
      // 如果画到一半时间到不能画了
      lastPoint = null
    }
    return
  }

  if (lastPoint) {
    drawLine(lastPoint, coord, selectedColor.value, selectedLineWidth.value)
    lastPoint = null
  }
}

// ==================== draw ====================

const drawBackground = () => {
  const drawFunc = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  }
  GameBoardRef.value?.draw(drawFunc)
}
const drawLine = (from: Coord, to: Coord, color: string, width: number) => {
  const drawFunc = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
  }
  GameBoardRef.value?.draw(drawFunc)
}
const drawStroke = (chunk: StrokeChunk, latest?: boolean) => {
  const drawFunc = (ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = chunk.color
    ctx.lineWidth = chunk.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = latest ? chunk.points.length - 2 : 0; i < chunk.points.length; i++) {
      const point = chunk.points[i]
      if (i === 0) {
        ctx.moveTo(point[0], point[1])
      } else {
        ctx.lineTo(point[0], point[1])
      }
    }
    ctx.stroke()
  }
  GameBoardRef.value?.draw(drawFunc)
}
const drawStrokes = (strokes: StrokeChunk[]) => {
  strokes.forEach(chunk => {
    drawStroke(chunk)
  })
}

// ==================== sync ====================

let syncTimer: number | null = null
const sendStrokes = (strokes: StrokeChunk[]) => {
  socket.emit(DrawGuessCustomMsgTypes.DrawStroke, strokes)
}
onMounted(() => {
  syncTimer = setInterval(() => {
    if (currentStrokes.length > 0) {
      sendStrokes(currentStrokes)
      currentStrokes.length = 0
    }
  }, 1000)
  socket.on(DrawGuessCustomMsgTypes.SyncStrokes, (data: SyncStrokeDTO) => {
    drawStrokes(data)
  })
  socket.on('clearCanvas', () => {
    drawBackground()
  })
})
onUnmounted(() => {
  if (syncTimer) {
    clearInterval(syncTimer)
  }
  socket.off(DrawGuessCustomMsgTypes.SyncStrokes)
  socket.off('clearCanvas')
})

// ==================== 倒计时 ====================

const timerValue = ref(displayTime(DrawGuessDurations.TurnDuration))
let countdownTimer: number | null = null
const updateTimerValue = () => {
  timerValue.value = displayTime(room.duration - (Date.now() - room.startTime))
}

watch(
  () => room.turnStatus,
  (newStatus, oldStatus) => {
    updateTimerValue()
  },
  { immediate: true }
)
watch(
  () => room.strokes,
  (newStrokes, oldStrokes) => {
    console.log('room.strokes changed', newStrokes)
    if (room.status === 'playing') {
      nextTick(() => {
        drawBackground()
        drawStrokes(newStrokes)
      })
    }
  },
  { immediate: true }
)

onMounted(() => {
  countdownTimer = setInterval(() => {
    updateTimerValue()
  }, 1000)
})
onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
  }
})
</script>

<template>
  <div v-if="room.status === 'playing'">
    <div class="info-bar">
      <div class="hint">
        <template v-if="imDrawer">
          <div>请画：</div>
          <div class="word-to-draw">{{ room.word }}</div>
        </template>
        <template v-else>
          <div>提示：</div>
          <div v-if="room.category" class="word-category">{{ room.category || '' }}</div>
          <div v-if="room.wordLength" class="word-length">，{{ room.wordLength }}个字</div>
        </template>
      </div>
      <div class="timer">{{ timerValue }}秒</div>
    </div>
    <GameBoard
      :width="CANVAS_WIDTH"
      :height="CANVAS_HEIGHT"
      :background="'yellow'"
      ref="GameBoardRef"
      :allow-panning="false"
      :allow-pinching="false"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      :highlight="imDrawing"
    >
      <template #control-left>
        <div class="draw-options">
          <div class="color-select">
            <div
              v-for="color in COLOR_OPTIONS"
              :key="color"
              :style="{ backgroundColor: color }"
              class="color-option"
              :class="{ selected: selectedColor === color }"
              @click="selectedColor = color"
            ></div>
          </div>
          <div class="line-width-select">
            <div
              v-for="width in LINE_WIDTH_OPTIONS"
              :key="width"
              class="line-width-option"
              :style="{ height: width + 'px' }"
              :class="{ selected: selectedLineWidth === width }"
              @click="selectedLineWidth = width"
            ></div>
          </div>
        </div>
      </template>
    </GameBoard>
    <Modal
      :show="room.turnStatus === 'after' && room.roundStatus === 'ing'"
      :hide-footer="true"
      :blur-backdrop="false"
      :placement="'bottom'"
    >
      <div class="turn-result">
        <div class="result-row">
          答案：
          <div class="result">{{ room.word }}</div>
        </div>
        <div class="reply">
          <Btn type="primary" small>&nbsp;&nbsp;赞&nbsp;&nbsp;</Btn>
          <Btn type="danger" small>&nbsp;&nbsp;踩&nbsp;&nbsp;</Btn>
        </div>
      </div>
    </Modal>
  </div>
</template>

<style lang="less" scoped>
.info-bar {
  display: flex;
  align-items: center;
  color: var(--text);
  font-size: 14px;
  height: 100%;
  margin: 2px 0 6px 0;

  .hint {
    flex: 1 1 auto;
    display: flex;
    line-height: 14px;
    align-items: center;
    margin-left: 1px;

    .word-to-draw,
    .word-length,
    .word-category {
      font-weight: bold;
    }
  }
}

.draw-options {
  display: flex;
  gap: 8px;
  .color-select {
    display: flex;
    gap: 4px;
    .color-option {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid transparent;
      background-clip: padding-box;
      cursor: pointer;

      &.selected {
        border: 2px solid rgba(0, 0, 0, 0.2);
      }
    }
  }
  .line-width-select {
    display: flex;
    gap: 4px;
    align-items: center;
    .line-width-option {
      width: 20px;
      border-radius: 12px;
      border: 2px solid transparent;
      background-clip: padding-box;
      background-color: var(--text);
      cursor: pointer;
      transform: rotate(-45deg);

      &.selected {
        border: 2px solid rgba(0, 0, 0, 0.2);
      }

      .line-preview {
        width: 100%;
        background-color: var(--text);
      }
    }
  }
}

.turn-result {
  .result-row {
    display: flex;
    color: var(--text);
    justify-content: center;
    align-items: center;
    margin: 6px 0 12px 0;
    font-size: 16px;

    .result {
      font-weight: bold;
    }
  }
  .reply {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
}
</style>
