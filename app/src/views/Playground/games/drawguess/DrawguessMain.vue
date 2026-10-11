<script setup lang="ts">
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import GameBoard from '@/components/GameBoard.vue'
import LoadingEllipsis from '@/components/LoadingEllipsis.vue'
import Modal from '@/components/Modal.vue'
import { request } from '@/utils/request'
import { useToastStore } from '@/store/toast'
import { Coord, IGameRoom, WsCustomMsg, WsCustomMsgName, WsEventMsg } from 'shared/types/game'
import {
  DrawGuessCustomMsgTypes,
  DrawGuessDurations,
  DrawGuessReaction,
  IDrawGuessRoom,
  StrokeChunk,
  SyncStrokeDTO,
  ReplayData,
} from 'shared/types/games/drawguess'
import { coordTransform, displayTime, TaskQueue } from 'shared/utils'
import { Socket } from 'socket.io-client'
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  Ref,
  ref,
  watch,
  watchEffect,
} from 'vue'

const toastStore = useToastStore()
const { room, userId, socket } = defineProps<{
  room: IDrawGuessRoom
  userId: string
  socket: Socket
}>()

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600

const COLOR_OPTIONS = ['black', 'white', 'red', 'orange', 'yellow', 'green', 'blue', 'purple']
const LINE_WIDTH_OPTIONS = [1, 3, 5, 10]

const GameBoardRef = ref<InstanceType<typeof GameBoard> | null>(null)
const imDrawer = computed(() => room.drawerId === userId)
const imDrawing = computed(() => imDrawer.value && room.turnStatus === 'ing')
const canDraw = computed(() => imDrawer.value && room.turnStatus === 'ing')

// ==================== 颜色/粗细选择 ====================

const selectedColor = ref(COLOR_OPTIONS[0])
const selectedLineWidth = ref(LINE_WIDTH_OPTIONS[1])

// ==================== 动作映射到绘制 ====================

const sendQueue: StrokeChunk[] = []
let currentStrokeId = 0 // 用于后续连接
let lastPoint: Coord | null = null // 用于画线

const onPointerDown = (coord: Coord) => {
  if (!canDraw.value) return

  const now = Date.now()
  currentStrokeId = now
  const newStroke = {
    id: now,
    start: now,
    end: now,
    color: selectedColor.value,
    width: selectedLineWidth.value,
    points: [[coord.x, coord.y]] as [number, number][],
  }
  sendQueue.push(newStroke)
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

  const now = Date.now()
  let currentStroke = sendQueue.at(-1)
  if (currentStroke) {
    currentStroke.points.push([coord.x, coord.y])
    currentStroke.end = now
  } else {
    currentStroke = {
      id: currentStrokeId,
      start: now,
      end: now,
      color: selectedColor.value,
      width: selectedLineWidth.value,
      points: [[coord.x, coord.y]] as [number, number][],
    }
    sendQueue.push(currentStroke)
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
const onClearCanvas = () => {
  if (!canDraw.value) return
  socket.emit(DrawGuessCustomMsgTypes.ClearCanvas)
  drawBackground()
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
const drawAllStrokes = (strokes: StrokeChunk[]) => {
  strokes.forEach(chunk => {
    drawStroke(chunk)
  })
}

// ==================== animation ====================

const animateStroke = async (stroke: StrokeChunk) => {
  return new Promise<void>(resolve => {
    const strokeDuration = stroke.end - stroke.start
    const strokeLength = stroke.points.length
    let currentFrame = 0
    let startTime = Date.now()
    const currentPoint = coordTransform(stroke.points[0])
    if (currentStrokeId === stroke.id && lastPoint) {
      // 接着画，先连上第一个点
      drawLine(lastPoint, currentPoint, stroke.color, stroke.width)
      lastPoint = currentPoint
    } else {
      // 新的stroke，设置lastPoint
      lastPoint = currentPoint
    }
    function drawFrame() {
      const nextFrame = Math.round(((Date.now() - startTime) / strokeDuration) * strokeLength)
      if (nextFrame > currentFrame) {
        if (nextFrame >= strokeLength) {
          // 画完了
          resolve()
          return
        }
        // need draw
        currentFrame = nextFrame
        const currentPoint = coordTransform(stroke.points[currentFrame])
        drawLine(lastPoint!, currentPoint, stroke.color, stroke.width)
        lastPoint = currentPoint
      }
      requestAnimationFrame(drawFrame)
    }
    requestAnimationFrame(drawFrame)
  })
}
const animatedStrokesQueue = new TaskQueue<StrokeChunk>(animateStroke)

// ==================== sync ====================

let syncTimer: number | null = null
const sendStrokes = () => {
  if (sendQueue.length > 0) {
    socket.emit(DrawGuessCustomMsgTypes.DrawStroke, sendQueue)
    sendQueue.length = 0
  }
}
onMounted(() => {
  syncTimer = setInterval(() => {
    sendStrokes()
  }, 1000)
  socket.on(DrawGuessCustomMsgTypes.SyncStrokes, (data: SyncStrokeDTO) => {
    animatedStrokesQueue.addTask(data)
  })
  socket.on('clearCanvas', () => {
    drawBackground()
  })
  // 画家换了词（server 只发给其他玩家）
  socket.on(DrawGuessCustomMsgTypes.WordChanged, () => {
    toastStore.showToast({ content: '画家更换了词汇', type: '?' })
  })
})
onUnmounted(() => {
  if (syncTimer) {
    clearInterval(syncTimer)
  }
  socket.off(DrawGuessCustomMsgTypes.SyncStrokes)
  socket.off('clearCanvas')
  socket.off(DrawGuessCustomMsgTypes.WordChanged)
})

// ==================== 倒计时 ====================

const timerValue = ref(displayTime(DrawGuessDurations.TurnBeforeDuration))
let countdownTimer: number | null = null
const updateTimerValue = () => {
  timerValue.value = displayTime(room.duration - (Date.now() - room.startTime))
  canChangeWord.value = room.turnStatus === 'ing'
    && Date.now() - room.startTime <= DrawGuessDurations.ChangeWordWindow
}

// ==================== round结束展示本回合所有画作 ====================

const replayData = ref<{ [turn: number]: ReplayData }>({})
const replayIndex = ref(1) // start from 1
const replayCurRound = computed(() => `${replayIndex.value}/${room.maxRounds}`)
const replayCurDrawerName = computed(() => {
  const drawerId = replayData.value[replayIndex.value]?.drawerId
  return `${replayData.value[replayIndex.value]?.word || ''} by ${room.users[drawerId || '']?.name || ''}`
})
const showPrevReplay = () => {
  const cur = replayIndex.value
  const total = room.maxRounds
  const next = ((cur - 2 + total) % total) + 1
  replayIndex.value = next
  selectReplayTurn(next)
}
const showNextReplay = () => {
  const cur = replayIndex.value
  const total = room.maxRounds
  const next = (cur % total) + 1
  replayIndex.value = next
  selectReplayTurn(next)
}
const selectReplayTurn = (turn: number) => {
  if (replayData.value[turn]) {
    replayIndex.value = turn
    drawBackground()
    drawAllStrokes(replayData.value[turn].strokes)
  } else {
    socket.emit(DrawGuessCustomMsgTypes.SyncReplayData, { turn })
  }
}
socket.on(DrawGuessCustomMsgTypes.SyncReplayData, (data: ReplayData) => {
  const turn = data.turn
  replayData.value[turn] = data
  selectReplayTurn(turn)
})

// ==================== 聊天 ====================

const { clearMessages, toggleChat, setChatTitle, toggleCanSend, addMessage } = inject(
  'GameChat'
) as any
watch(
  () => room.round,
  () => {
    // 只在新的一局开始时清空聊天，turn 之间保留
    clearMessages()
  }
)
watch(
  () => room.turnStatus + room.roundStatus,
  () => {
    if (room.turnStatus === 'ing') {
      setChatTitle('猜词')
      toggleChat(true)
      addMessage({
        id: `system-${Date.now()}`,
        type: 'system',
        content: `第${room.turn}回合开始，${room.users[room.drawerId]?.name || ''}正在作画`,
      })
    } else {
      setChatTitle()
    }
    if (room.turnStatus === 'after') {
      addMessage({
        id: `system-${Date.now()}`,
        type: 'system',
        content: `第${room.turn}回合结束，${
          room.correctUserIds.length > 0 ? `${room.correctUserIds.length}个人` : `没有人`
        }猜对${room.correctUserIds.length > 0 ? '了' : ''}，答案是：${room.word}`,
      })
    }
    if (room.roundStatus === 'after') {
      addMessage({
        id: `system-${Date.now()}`,
        type: 'system',
        content: '本局游戏结束',
      })
    }
    toggleCanSend(!(imDrawer.value && room.turnStatus === 'ing'))
  }
)
onUnmounted(() => {
  setChatTitle()
})

// ==================== 换词 ====================

const showChangeWordConfirm = ref(false)
const canChangeWord = ref(false)
const onChangeWord = () => {
  if (!imDrawer.value || !room.word) return
  const inBeforePhase = room.turnStatus === 'before'
  const inChangeWindow = room.turnStatus === 'ing' && canChangeWord.value
  if (!inBeforePhase && !inChangeWindow) return
  showChangeWordConfirm.value = false
  socket.emit(DrawGuessCustomMsgTypes.ChangeWord)
}

// ==================== 点赞点踩 ====================

/** turn after 展示并交互当前画作；round after 浏览回放时只读展示对应画作 */
const activeLikes = computed(() => {
  if (room.roundStatus === 'after') {
    return replayData.value[replayIndex.value]?.likes || 0
  }
  if (room.turnStatus === 'after' && room.roundStatus === 'ing') {
    return room.likes || 0
  }
  return 0
})
const activeDislikes = computed(() => {
  if (room.roundStatus === 'after') {
    return replayData.value[replayIndex.value]?.dislikes || 0
  }
  if (room.turnStatus === 'after' && room.roundStatus === 'ing') {
    return room.dislikes || 0
  }
  return 0
})
// drawer 自己不能投；浏览回放阶段只读
const canReact = computed(
  () => room.turnStatus === 'after' && room.roundStatus === 'ing' && !imDrawer.value
)

const sendReaction = (value: DrawGuessReaction) => {
  if (!canReact.value) return
  socket.emit(DrawGuessCustomMsgTypes.Reaction, value)
}

// 计数渐变：目标变化时逐级过渡（5=>6=>7...），差值过大直接跳变
const displayLikes = ref(0)
const displayDislikes = ref(0)
const tweenCounter = (display: { value: number }, target: number) => {
  if (display.value === target) return
  if (Math.abs(target - display.value) > 20) {
    display.value = target
    return
  }
  const step = () => {
    if (display.value === target) return
    display.value += display.value < target ? 1 : -1
    if (display.value !== target) setTimeout(step, 90)
  }
  step()
}
watch(activeLikes, (target) => tweenCounter(displayLikes, target))
watch(activeDislikes, (target) => tweenCounter(displayDislikes, target))

// 进度条最少 8 格：每票占比 = 1 / max(8, 总票数)，超过 8 票按比例收缩
const reactionUnit = computed(() => 100 / Math.max(8, activeLikes.value + activeDislikes.value))
const likePercent = computed(() => activeLikes.value * reactionUnit.value)
const dislikePercent = computed(() => activeDislikes.value * reactionUnit.value)

// ==================== lifecycle ====================

watch(
  () => room.turnStatus,
  (newStatus, oldStatus) => {
    updateTimerValue()
    if (newStatus !== 'before') showChangeWordConfirm.value = false
  },
  { immediate: true }
)
watch(
  () => room.roundStatus,
  (newStatus, oldStatus) => {
    // round开始，初始化
    if (newStatus === 'ing') {
      drawBackground()
      replayIndex.value = 1
      replayData.value = {}
    } else if (newStatus === 'after') {
      // round结束，展示第一回合画作
      selectReplayTurn(1)
    }
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
        drawAllStrokes(newStrokes)
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
    <!-- turn进行中提示 -->
    <div v-if="room.turnStatus === 'before'" class="flex-lr-box bar">
      <div class="left">
        <template v-if="imDrawer">
          你画：<span class="word-to-draw">{{ room.word }}</span>
          <Btn v-if="room.word" class="change-word-btn" small @click="showChangeWordConfirm = true">换词</Btn>
        </template>
        <template v-else>你猜</template>
      </div>
      <div class="right">{{ timerValue }}秒后开始</div>
    </div>
    <div v-if="room.turnStatus === 'ing'" class="info-bar bar flex-lr-box">
      <div class="left">
        <template v-if="imDrawer">
          <div>你画：</div>
          <div class="word-to-draw">{{ room.word }}</div>
          <Btn v-if="room.word && canChangeWord" class="change-word-btn" small @click="showChangeWordConfirm = true">换词</Btn>
        </template>
        <template v-else>
          <div>提示：</div>
          <div v-if="room.category" class="word-category">{{ room.category || '' }}</div>
          <div v-if="room.wordLength" class="word-length">，{{ room.wordLength }}个字</div>
          <LoadingEllipsis v-if="!room.category || !room.wordLength"></LoadingEllipsis>
        </template>
      </div>
      <div class="right">{{ timerValue }}秒</div>
    </div>
    <!-- turn结束展示答案 -->
    <div
      v-else-if="room.turnStatus === 'after' && room.roundStatus === 'ing'"
      class="turn-result-bar flex-lr-box bar"
    >
      <div class="left">
        答案：
        <div class="result">{{ room.word }}</div>
      </div>
      <div class="right">{{ timerValue }}秒后继续</div>
    </div>
    <!-- round结束浏览本回合画作 -->
    <div v-else-if="room.roundStatus === 'after'" class="round-result-bar flex-lr-box bar">
      <div class="left">
        浏览作品
        <Btn small @click="showPrevReplay">上一个</Btn>
        <Btn small @click="showNextReplay">下一个</Btn>
        <div>{{ replayCurRound }}</div>
      </div>
      <div class="right">
        <div>{{ replayCurDrawerName }}</div>
      </div>
    </div>
    <Modal v-model:show="showChangeWordConfirm" title="确认换词" @cancel="showChangeWordConfirm = false" @confirm="onChangeWord">
      确定要换词吗？
    </Modal>
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
      <template #control-left v-if="imDrawing">
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
          <div class="line-width-select" v-if="imDrawing">
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
      <template #control-right v-if="imDrawing">
        <Btn type="danger" small @click="onClearCanvas">清空</Btn>
      </template>
    </GameBoard>

    <!-- 点赞点踩：turn after 可交互（drawer 置灰），round after 浏览回放时只读 -->
    <div v-if="room.turnStatus === 'after' || room.roundStatus === 'after'" class="reaction-bar">
      <div
        class="reaction-btn"
        :class="{ disabled: !canReact }"
        @click="sendReaction('like')"
      >
        👍<span v-if="displayLikes" class="count">{{ displayLikes }}</span>
      </div>
      <div class="reaction-track">
        <div class="reaction-fill like" :style="{ width: likePercent + '%' }"></div>
        <div class="reaction-fill dislike" :style="{ width: dislikePercent + '%' }"></div>
      </div>
      <div
        class="reaction-btn"
        :class="{ disabled: !canReact }"
        @click="sendReaction('dislike')"
      >
        👎<span v-if="displayDislikes" class="count">{{ displayDislikes }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.bar {
  margin: 2px 0 6px 0;
  color: var(--text);
  font-size: 14px;

  .word-to-draw {
    font-weight: bold;
  }

  .change-word-btn {
    margin-left: 0.5rem;
    flex: 0 0 auto;
  }
}
.info-bar {
  .left {
    flex: 1 1 auto;
    line-height: 14px;
    margin-left: 1px;
    gap: 0;

    .word-length,
    .word-category {
      font-weight: bold;
    }
  }
}
.turn-result-bar {
  .left {
    gap: 0;
    .result {
      font-weight: bold;
    }
    .dislike-btn {
      margin-left: 8px;
    }
  }
}
.round-result-bar {
  color: var(--text-secondary);
  font-size: 12px;
}

.reaction-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;

  .reaction-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    background: var(--bg);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    transition: 0.15s ease;
    user-select: none;
    flex: 0 0 auto;

    &:active:not(.disabled) {
      transform: scale(0.92);
    }

    // 置灰：emoji 用 grayscale 滤镜变灰
    &.disabled {
      cursor: default;
      filter: grayscale(1);
      opacity: 0.4;
    }

    .count {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }

  .reaction-track {
    flex: 1 1 auto;
    min-width: 0;
    height: 0.75rem;
    border-radius: 999px;
    background: var(--quote-bg);
    display: flex;
    justify-content: space-between;
    overflow: hidden;

    .reaction-fill {
      height: 100%;
      min-width: 0;
      transition: width 0.25s ease;

      &.like {
        background: var(--primary-color);
        border-radius: 999px 0 0 999px;
      }

      &.dislike {
        background: #e05252;
        border-radius: 0 999px 999px 0;
      }
    }
  }
}

.draw-options {
  display: flex;
  gap: 4px;
  .color-select {
    display: flex;
    gap: 2px;
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
    gap: 0px;
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
