<script setup lang="ts">
import { computed, onMounted, ref, useSlots } from 'vue'
import CircleBtn from './CircleBtn.vue'
import { Coord } from 'shared/types/game.ts'
import { getL2Distance, limit } from 'shared/utils.ts'

const {
  width,
  height,
  highlight = false,
  background = '',
  allowPanning = true,
  allowPinching = true,
} = defineProps<{
  width: number
  height: number
  background?: string
  highlight?: boolean
  allowPanning?: boolean
  allowPinching?: boolean
}>()
const emit = defineEmits<{
  (e: 'pointerdown', event: Coord): void
  (e: 'pointermove', event: Coord): void
  (e: 'pointerup', event: Coord): void
  (e: 'click', event: Coord): void
}>()

const slots = useSlots()

const viewportRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isPanning = ref(false)
const isPinching = ref(false)
let panStartOffset = { x: 0, y: 0 }
const pinchStartScale = ref(1)
const activePointers = new Map<number, Coord>()
const activePointersStart = new Map<number, Coord>()

const viewportStyle = computed(() => ({
  width: `100%`,
  aspectRatio: `${width} / ${height}`,
  background: background || 'var(--board-bg)',
}))
const stageStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}))

// 设置画布尺寸
const setCanvasSize = () => {
  const canvas = canvasRef.value
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const dpr = window.devicePixelRatio || 1
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
}

const setZoom = (delta: number, x?: number, y?: number) => {
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const nextScale = limit({ value: scale.value + delta, min: 0.1, max: 3 })
  const anchorX = x ?? rect.left + rect.width / 2
  const anchorY = y ?? rect.top + rect.height / 2
  const localX = (anchorX - rect.left - offsetX.value) / scale.value
  const localY = (anchorY - rect.top - offsetY.value) / scale.value
  scale.value = nextScale
  offsetX.value = anchorX - rect.left - localX * nextScale
  offsetY.value = anchorY - rect.top - localY * nextScale
}

/**
 * 重置stage的offset和scale
 */
const resetCanvasView = () => {
  offsetX.value = 0
  offsetY.value = 0
  const rect = viewportRef.value?.getBoundingClientRect()
  if (!rect) {
    return
  }
  scale.value = Math.min(rect.width / width, rect.height / height)
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  if (!allowPinching) return
  setZoom(event.deltaY < 0 ? 0.08 : -0.08, event.offsetX, event.offsetY)
}

/**
 * calc coord on canvas from viewport position based on offset and scale, return null if out of canvas
 */
const calcCoordFromPos = (pos: Coord): Coord | null => {
  const canvasX = (pos.x - offsetX.value) / scale.value
  const canvasY = (pos.y - offsetY.value) / scale.value

  if (canvasX < 0 || canvasX > width || canvasY < 0 || canvasY > height) {
    return null
  }
  return { x: canvasX, y: canvasY }
}

const onPointerDown = (event: PointerEvent) => {
  if (activePointers.size >= 2) {
    return
  }

  activePointersStart.set(event.pointerId, { x: event.offsetX, y: event.offsetY })
  activePointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })
  const currentTarget = event.currentTarget as HTMLElement | null
  currentTarget?.setPointerCapture?.(event.pointerId)

  if (activePointers.size === 1) {
    if (allowPanning) {
      isPanning.value = true
      panStartOffset = { x: offsetX.value, y: offsetY.value }
    }
  } else if (activePointers.size === 2) {
    isPanning.value = false
    if (allowPinching) {
      isPinching.value = true
      pinchStartScale.value = scale.value
    }
  }

  const coord = calcCoordFromPos({ x: event.offsetX, y: event.offsetY })
  if (coord) {
    emit('pointerdown', coord)
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!activePointers.has(event.pointerId)) return
  activePointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY })

  if (activePointers.size >= 2) {
    if (isPinching.value) {
      const [first, second] = Array.from(activePointers.values())
      const [firstStart, secondStart] = Array.from(activePointersStart.values())
      const pinchDistance = getL2Distance(first, second)
      const pinchStartDistance = getL2Distance(firstStart, secondStart)
      const nextScale = limit({
        value: pinchStartScale.value * (pinchDistance / pinchStartDistance),
        min: 0.1,
        max: 2.2,
      })
      scale.value = nextScale
    }
  } else if (activePointers.size === 1) {
    if (isPanning.value) {
      const [first] = Array.from(activePointers.values())
      const [firstStart] = Array.from(activePointersStart.values())
      offsetX.value = panStartOffset.x + (first.x - firstStart.x)
      offsetY.value = panStartOffset.y + (first.y - firstStart.y)
    }
  }

  const coord = calcCoordFromPos({ x: event.offsetX, y: event.offsetY })
  if (coord) {
    emit('pointermove', coord)
  }
}

const onPointerUp = (event: PointerEvent) => {
  activePointers.delete(event.pointerId)
  activePointersStart.delete(event.pointerId)

  if (isPinching.value) {
    if (activePointers.size < 2) {
      isPinching.value = false
    }
    if (allowPanning && activePointers.size === 1) {
      isPanning.value = true
      panStartOffset = { x: offsetX.value, y: offsetY.value }
    }
  } else if (isPanning.value) {
    if (activePointers.size === 0) {
      isPanning.value = false
    }
  }

  const coord = calcCoordFromPos({ x: event.offsetX, y: event.offsetY })
  if (coord) {
    emit('pointerup', coord)
    emit('click', coord)
  }
}

const onDoubleClick = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

const onGestureBlock = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

const draw = (drawFunc: (ctx: CanvasRenderingContext2D) => void) => {
  const canvas = canvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  drawFunc(ctx)
}
defineExpose({
  draw,
})

// ==================== display ====================
const showAutoAdjustBtn = computed(() => {
  return allowPanning || allowPinching
})

onMounted(() => {
  setCanvasSize()
  resetCanvasView()
})
</script>

<template>
  <div
    ref="viewportRef"
    class="board-container"
    :class="{ highlight: highlight }"
    :style="viewportStyle"
    @wheel.prevent="onWheel"
    @pointerdown.prevent.stop="onPointerDown"
    @pointermove.prevent.stop="onPointerMove"
    @pointerup.prevent.stop="onPointerUp"
    @pointercancel.prevent.stop="onPointerUp"
    @dblclick.prevent.stop="onDoubleClick"
    @gesturestart="onGestureBlock"
    @gesturechange="onGestureBlock"
    @gestureend="onGestureBlock"
    @contextmenu.prevent.stop=""
  >
    <div class="board-stage" :style="stageStyle">
      <canvas ref="canvasRef" class="board-canvas"></canvas>
    </div>
  </div>

  <div class="board-controls">
    <div class="left">
      <slot name="control-left"></slot>
    </div>
    <div class="right">
      <slot name="control-right"></slot>
      <CircleBtn
        v-if="showAutoAdjustBtn"
        class="board-zoom-btn"
        variant="muted"
        :size="26"
        :font-size="14"
        aria-label="缩放"
        icon="auto-adjust-zoom"
        @click="resetCanvasView"
      >
      </CircleBtn>
    </div>
  </div>
</template>

<style scoped lang="less">
.board-container {
  width: 100%;
  position: relative;
  overflow: hidden;
  aspect-ratio: 640 / 400;
  display: block;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  background: #fafafa;
  touch-action: none;

  &.highlight {
    animation: borderBreath 2.5s ease-in-out infinite;
  }

  .board-stage {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;

    .board-canvas {
      display: block;
      pointer-events: none;
    }
  }
}

@keyframes borderBreath {
  0%,
  100% {
    box-shadow: 0 0 4px rgba(0, 230, 118, 0.1);
  }
  50% {
    box-shadow: 0 0 16px -4px rgba(0, 230, 118, 0.8);
  }
}

.board-controls {
  display: flex;
  margin-top: 6px;
  align-items: center;
  justify-content: space-between;

  .left {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .right {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  &:not(:has(.left > *)):not(:has(.right > *)) {
    display: none;
  }
}
</style>
