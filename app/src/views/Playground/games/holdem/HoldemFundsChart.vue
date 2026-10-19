<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Card from '@/components/Card.vue'
import { IHoldemRoom } from 'shared/types/games/holdem'

const { room } = defineProps<{ room: IHoldemRoom }>()

const COLORS = [
  '#1890ff',
  '#52c41a',
  '#fa8c16',
  '#eb2f96',
  '#722ed1',
  '#faad14',
  '#13c2c2',
  '#f5222d',
  '#a0d911',
  '#2f54eb',
]

// 固定 viewBox + meet 等比缩放：宽度撑满容器（≤屏幕宽），节点在 viewBox 里平分宽度
const W = 600
const H = 170
const PAD = { top: 10, bottom: 20, left: 56 } // right 动态按线尾标签宽度计算

// ==================== 移动端可读性：字号/线宽按容器宽度反比放大，保证屏幕上恒定 ~10px ====================

const chartEl = ref<HTMLElement>()
const containerWidth = ref(W)
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    containerWidth.value = entries[0]?.contentRect.width || W
  })
  if (chartEl.value) resizeObserver.observe(chartEl.value)
})
onUnmounted(() => resizeObserver?.disconnect())

/** viewBox 单位 → 屏幕像素的缩放系数（容器越窄，viewBox 内字号越大） */
const k = computed(() => W / Math.max(150, Math.min(containerWidth.value, W)))
const tickFontSize = computed(() => 10 * k.value)
const nameFontSize = computed(() => 11 * k.value)
const strokeWidth = computed(() => 2 * k.value)
const dotR = computed(() => 3 * k.value)

/** roundResults 新局在前，倒序成从左到右的时间轴 */
const rounds = computed(() => [...(room.roundResults || [])].reverse())

/** 玩家名：优先在线用户（可响应改名），退出的玩家用对局记录里最后的名字 */
const nameOf = (id: string): string => {
  const live = room.users[id]?.name
  if (live) return live
  for (let i = rounds.value.length - 1; i >= 0; i--) {
    const name = rounds.value[i].users?.[id]?.userName
    if (name) return name
  }
  return id
}

const fmt = (v: number) => (v > 0 ? `+${v}` : `${v}`)

/** 每个玩家一条线：累计资金变化（含开局 0 基点） */
const series = computed(() =>
  (room.userOrder || []).map((id, idx) => {
    let cum = 0
    const values = [0]
    for (const r of rounds.value) {
      cum += r.users?.[id]?.profit || 0
      values.push(cum)
    }
    return { id, name: nameOf(id), color: COLORS[idx % COLORS.length], values }
  }),
)

const nodeCount = computed(() => rounds.value.length + 1)

const yRange = computed(() => {
  let min = 0
  let max = 0
  for (const s of series.value) {
    for (const v of s.values) {
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }
  if (min === max) {
    min -= 50
    max += 50
  }
  const pad = (max - min) * 0.12
  return { min: min - pad, max: max + pad }
})

/** 右边距：按最长标签（名字 + 数值，取各回合最宽者）估算宽度，左右各留 4k 的空 */
const estimateNameUnits = (text: string) => {
  let units = 0
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e7f ? 1 : 0.6 // 全角 1em、半角 0.6em
  return units
}
const padRight = computed(() => {
  let maxUnits = 0
  for (const s of series.value) {
    for (const v of s.values) {
      maxUnits = Math.max(maxUnits, estimateNameUnits(`${s.name} ${fmt(v)}`))
    }
  }
  return maxUnits * nameFontSize.value + 8 * k.value
})

const x = (i: number) =>
  PAD.left + (i * (W - PAD.left - padRight.value)) / Math.max(1, nodeCount.value - 1)
const y = (v: number) =>
  PAD.top + ((yRange.value.max - v) / (yRange.value.max - yRange.value.min)) * (H - PAD.top - PAD.bottom)

/** 网格：0 处一道横实线，每 500 一道横虚线 */
const gridLines = computed(() => {
  const { min, max } = yRange.value
  const lines = [{ value: 0, isZero: true }]
  for (let v = Math.ceil(min / 500) * 500; v <= max; v += 500) {
    if (v !== 0) lines.push({ value: v, isZero: false })
  }
  return lines
})

// ==================== 回合选择（类似 K 线图的十字光标）：hover / 拖动选回合，竖线 + 节点右侧数值 ====================

const svgEl = ref<SVGSVGElement>()
const selectedIndex = ref(0)
// 默认选中最后（最新）一个回合；新回合进来后跟随
watch(
  () => nodeCount.value,
  (n) => {
    selectedIndex.value = n - 1
  },
  { immediate: true },
)

const indexFromClientX = (clientX: number): number => {
  const el = svgEl.value
  if (!el) return selectedIndex.value
  const rect = el.getBoundingClientRect()
  const vx = ((clientX - rect.left) / Math.max(1, rect.width)) * W
  const step = (W - PAD.left - padRight.value) / Math.max(1, nodeCount.value - 1)
  return Math.max(0, Math.min(nodeCount.value - 1, Math.round((vx - PAD.left) / step)))
}

let dragging = false
const resetSelection = () => {
  selectedIndex.value = nodeCount.value - 1
}
const onPointerDown = (e: PointerEvent) => {
  e.preventDefault()
  e.stopPropagation()
  dragging = true
  svgEl.value?.setPointerCapture?.(e.pointerId)
  // 兜底：移动端指针事件序列不可靠（pointerup 可能不派发）
  window.addEventListener('pointerup', resetSelection, { once: true })
  window.addEventListener('pointercancel', resetSelection, { once: true })
  selectedIndex.value = indexFromClientX(e.clientX)
}
const onPointerMove = (e: PointerEvent) => {
  e.stopPropagation()
  // 鼠标 hover 或按住拖动时更新
  if (e.pointerType === 'mouse' || dragging) {
    selectedIndex.value = indexFromClientX(e.clientX)
  }
}
const onPointerUp = (e: PointerEvent) => {
  if (!dragging) return
  dragging = false
  svgEl.value?.releasePointerCapture?.(e.pointerId)
  resetSelection()
}
const onPointerLeave = () => {
  if (dragging) return // 捕获拖动中不算离开
  resetSelection()
}

/** 选中回合的节点标签：名字 + 该回合数值，y 跟随节点；相邻标签挤开最小间距避免重叠 */
const labels = computed(() => {
  const idx = Math.min(selectedIndex.value, nodeCount.value - 1)
  const items = series.value.map((s) => ({
    ...s,
    lx: x(idx) + 4 * k.value,
    ly: y(s.values[idx]),
    text: `${s.name} ${fmt(s.values[idx])}`,
  }))
  const MIN_GAP = nameFontSize.value + 1
  const sorted = [...items].sort((a, b) => a.ly - b.ly)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].ly - sorted[i - 1].ly < MIN_GAP) {
      sorted[i].ly = sorted[i - 1].ly + MIN_GAP
    }
  }
  return sorted
})

/** 回合太多时稀疏标注横坐标，最多约 10 个 */
const xLabelEvery = computed(() => Math.max(1, Math.ceil(nodeCount.value / 10)))

const pointsOf = (values: number[]) => values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
</script>

<template>
  <Card>
    <template #title>资金变化</template>
    <div ref="chartEl" class="chart-wrap">
      <svg
        ref="svgEl"
        class="chart"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="xMidYMid meet"
        @pointerdown.stop.prevent="onPointerDown"
        @pointermove.stop="onPointerMove"
        @pointerup.stop="onPointerUp"
        @pointercancel.stop="onPointerUp"
        @pointerleave="onPointerLeave"
        @contextmenu.prevent
      >
        <!-- 网格：0 实线 + 每 500 虚线，左侧刻度值 -->
        <g v-for="(line, i) in gridLines" :key="`t${i}`">
          <line
            :x1="PAD.left"
            :x2="W - padRight"
            :y1="y(line.value)"
            :y2="y(line.value)"
            :stroke="line.isZero ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.15)'"
            :stroke-dasharray="line.isZero ? undefined : '4 3'"
            stroke-width="1"
          />
          <text
            :x="PAD.left - 4 * k"
            :y="y(line.value) + 3 * k"
            text-anchor="end"
            class="tick-text"
            :font-size="tickFontSize"
          >
            {{ line.value }}
          </text>
        </g>
        <!-- 横轴刻度：开局 + 各回合 -->
        <text
          v-for="i in nodeCount"
          v-show="(i - 1) % xLabelEvery === 0"
          :key="`x${i}`"
          :x="x(i - 1)"
          :y="H - 6"
          text-anchor="middle"
          class="tick-text"
          :font-size="tickFontSize"
        >
          {{ i === 1 ? '开局' : rounds[i - 2].round }}
        </text>
        <!-- 选中的回合：一道竖虚线 -->
        <line
          :x1="x(selectedIndex)"
          :x2="x(selectedIndex)"
          :y1="PAD.top"
          :y2="H - PAD.bottom"
          stroke="rgba(0,0,0,0.35)"
          stroke-dasharray="4 3"
          stroke-width="1"
        />
        <!-- 每个玩家一条累计变化折线 -->
        <g v-for="s in series" :key="s.id">
          <polyline
            :points="pointsOf(s.values)"
            fill="none"
            :stroke="s.color"
            :stroke-width="strokeWidth"
          />
          <circle
            v-for="(v, i) in s.values"
            :key="i"
            :cx="x(i)"
            :cy="y(v)"
            :r="dotR"
            :fill="s.color"
          />
        </g>
        <!-- 选中回合的节点标签：名字 + 数值（带底色描边，压在折线上也可读） -->
        <text
          v-for="l in labels"
          :key="`n${l.id}`"
          :x="l.lx"
          :y="l.ly + 3 * k"
          class="name-text"
          :font-size="nameFontSize"
          :fill="l.color"
          :stroke-width="3 * k"
        >
          {{ l.text }}
        </text>
      </svg>
    </div>
  </Card>
</template>

<style lang="less" scoped>
.chart-wrap {
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;

  .chart {
    display: block;
    width: 100%;
    touch-action: none; // 拖动选回合时不触发页面滑动/缩放
    cursor: crosshair;

    .tick-text {
      fill: var(--text-light, #999);
    }

    .name-text {
      font-weight: bold;
      pointer-events: none;
      paint-order: stroke;
      stroke: var(--card-bg, #fff);
    }
  }
}
</style>
