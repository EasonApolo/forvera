<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import Card from '@/components/Card.vue'
import GreyText from '@/components/GreyText.vue'

const MAP_SIZE_M = 200
const CELL_PX = 24
const MAP_PX = MAP_SIZE_M * CELL_PX
const MIN_SCALE = 0.2
const MAX_SCALE = 4

const entities = [
  { x: 50, y: 50, icon: '🏠', label: '房子' },
  { x: 51, y: 51, icon: '🏬', label: '仓库' },
  { x: 49, y: 46, icon: '👨', label: '男人' },
  { x: 52, y: 53, icon: '👩', label: '女人' },
]

const viewportRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)

const activePointers = new Map<number, { x: number; y: number }>()
let isPanning = false
let panStartX = 0
let panStartY = 0
let panOriginX = 0
let panOriginY = 0
let pinchStartDistance = 0
let pinchStartScale = 1
let pinchCenterX = 0
let pinchCenterY = 0
let pinchLocalX = 0
let pinchLocalY = 0
let renderRaf: number | null = null
let resizeHandler: (() => void) | null = null

const mapSummary = computed(() => `地图尺寸: ${MAP_SIZE_M}m x ${MAP_SIZE_M}m`)

const clampScale = (next: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))

const scheduleRender = () => {
  if (renderRaf !== null) {
    cancelAnimationFrame(renderRaf)
  }
  renderRaf = window.requestAnimationFrame(() => {
    renderRaf = null
    drawMap()
  })
}

const fitToViewport = () => {
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const fitScale = Math.min(rect.width / MAP_PX, rect.height / MAP_PX)
  scale.value = clampScale(fitScale)
  offsetX.value = (rect.width - MAP_PX * scale.value) / 2
  offsetY.value = (rect.height - MAP_PX * scale.value) / 2
  scheduleRender()
}

const drawMap = () => {
  const canvas = canvasRef.value
  const viewport = viewportRef.value
  if (!canvas || !viewport) return

  const rect = viewport.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  canvas.style.width = `${rect.width}px`
  canvas.style.height = `${rect.height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)

  // Atmosphere background
  const bg = ctx.createLinearGradient(0, 0, 0, rect.height)
  bg.addColorStop(0, '#f3f8ef')
  bg.addColorStop(1, '#e2f1df')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, rect.width, rect.height)

  ctx.save()
  ctx.translate(offsetX.value, offsetY.value)
  ctx.scale(scale.value, scale.value)

  ctx.fillStyle = '#eef6e7'
  ctx.fillRect(0, 0, MAP_PX, MAP_PX)

  // 10m major lines
  ctx.strokeStyle = 'rgba(74, 100, 72, 0.25)'
  ctx.lineWidth = 1 / scale.value
  for (let m = 0; m <= MAP_SIZE_M; m += 10) {
    const p = m * CELL_PX
    ctx.beginPath()
    ctx.moveTo(p, 0)
    ctx.lineTo(p, MAP_PX)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, p)
    ctx.lineTo(MAP_PX, p)
    ctx.stroke()
  }

  // Border
  ctx.strokeStyle = 'rgba(53, 79, 55, 0.8)'
  ctx.lineWidth = 2 / scale.value
  ctx.strokeRect(0, 0, MAP_PX, MAP_PX)

  // Entities
  for (const entity of entities) {
    const px = (entity.x + 0.5) * CELL_PX
    const py = (entity.y + 0.5) * CELL_PX

    ctx.font = `${18 / scale.value}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(entity.icon, px, py)

    ctx.font = `${11 / scale.value}px "Trebuchet MS", "Avenir Next", sans-serif`
    ctx.fillStyle = '#2d4030'
    ctx.fillText(`${entity.label} [${entity.x},${entity.y}]`, px, py + 14 / scale.value)
  }

  ctx.restore()
}

const zoomAt = (delta: number, clientX: number, clientY: number) => {
  const viewport = viewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()

  const nextScale = clampScale(scale.value + delta)
  const localX = (clientX - rect.left - offsetX.value) / scale.value
  const localY = (clientY - rect.top - offsetY.value) / scale.value

  scale.value = nextScale
  offsetX.value = clientX - rect.left - localX * nextScale
  offsetY.value = clientY - rect.top - localY * nextScale
  scheduleRender()
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomAt(event.deltaY < 0 ? 0.08 : -0.08, event.clientX, event.clientY)
}

const onPointerDown = (event: PointerEvent) => {
  event.preventDefault()
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)

  if (activePointers.size === 1) {
    isPanning = true
    panStartX = event.clientX
    panStartY = event.clientY
    panOriginX = offsetX.value
    panOriginY = offsetY.value
    return
  }

  if (activePointers.size === 2) {
    const viewport = viewportRef.value
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const pts = Array.from(activePointers.values())
    const p1 = pts[0]
    const p2 = pts[1]
    const centerX = (p1.x + p2.x) / 2
    const centerY = (p1.y + p2.y) / 2

    pinchCenterX = centerX - rect.left
    pinchCenterY = centerY - rect.top
    pinchStartDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    pinchStartScale = scale.value
    pinchLocalX = (pinchCenterX - offsetX.value) / scale.value
    pinchLocalY = (pinchCenterY - offsetY.value) / scale.value
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!activePointers.has(event.pointerId)) return
  event.preventDefault()
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (activePointers.size === 1 && isPanning) {
    offsetX.value = panOriginX + (event.clientX - panStartX)
    offsetY.value = panOriginY + (event.clientY - panStartY)
    scheduleRender()
    return
  }

  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values())
    const p1 = pts[0]
    const p2 = pts[1]
    const currentDistance = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    if (pinchStartDistance <= 0) return

    const nextScale = clampScale(pinchStartScale * (currentDistance / pinchStartDistance))
    scale.value = nextScale
    offsetX.value = pinchCenterX - pinchLocalX * nextScale
    offsetY.value = pinchCenterY - pinchLocalY * nextScale
    scheduleRender()
  }
}

const onPointerUp = (event: PointerEvent) => {
  event.preventDefault()
  activePointers.delete(event.pointerId)
  if (activePointers.size === 0) {
    isPanning = false
    pinchStartDistance = 0
  }
}

onMounted(async () => {
  await nextTick()
  fitToViewport()
  resizeHandler = () => fitToViewport()
  window.addEventListener('resize', resizeHandler)
})

onUnmounted(() => {
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (renderRaf !== null) {
    cancelAnimationFrame(renderRaf)
    renderRaf = null
  }
})
</script>

<template>
  <div class="village-page">
    <div class="village-header">
      <GreyText>🏘 Village</GreyText>
      <div class="summary">{{ mapSummary }}</div>
    </div>

    <Card class="village-card">
      <div
        ref="viewportRef"
        class="village-viewport"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <canvas ref="canvasRef" class="village-canvas"></canvas>
      </div>
    </Card>
  </div>
</template>

<style scoped lang="less">
.village-page {
  width: min(100%, 980px);
  margin: 0 auto;
  padding: 12px;
  box-sizing: border-box;
}

.village-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .summary {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.village-card {
  padding: 0;
}

.village-viewport {
  width: 100%;
  height: min(72vh, 680px);
  min-height: 360px;
  overflow: hidden;
  border-radius: 8px;
  touch-action: none;
  background: #ebf5e8;
}

.village-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 640px) {
  .village-page {
    padding: 8px;
  }

  .village-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .village-viewport {
    height: 68vh;
    min-height: 320px;
  }
}
</style>
