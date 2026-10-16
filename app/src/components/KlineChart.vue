<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MarketChartResult } from 'shared/types/stock'

const props = defineProps<{
  chart: MarketChartResult | null
  loading?: boolean
  /** 评论标记：日期 + 期望价格（无期望价格则当日只画短竖线刻度） */
  commentMarks?: { date: string; targetPrice: number | null }[]
  /** 提示框相对指针的偏移，默认 20,20 */
  tooltipOffset?: { x?: number; y?: number }
}>()

// candlesticks
const CHART_W = 320
const CHART_H = 150
const candles = computed(() => {
  const chart = props.chart
  if (!chart) return []
  const n = chart.timestamps.length
  if (!n) return []
  const slotW = CHART_W / n
  const bodyW = Math.max(1, slotW * 0.6)
  const max = Math.max(...chart.high.filter(v => v != null), 0)
  if (max <= 0) return []
  const y = (v: number) => CHART_H - (v / max) * CHART_H
  const list: Array<{
    mid: number
    highY: number
    lowY: number
    bodyY: number
    bodyH: number
    bodyW: number
    up: boolean
  }> = []
  for (let i = 0; i < n; i++) {
    const open = chart.opens[i]
    const close = chart.closes[i]
    const high = chart.high[i]
    const low = chart.low[i]
    if (open == null || close == null || high == null || low == null) continue
    const mid = (i + 0.5) * slotW
    const up = close >= open
    list.push({
      mid,
      highY: y(high),
      lowY: y(low),
      bodyY: y(Math.max(open, close)),
      bodyH: Math.max(0.8, Math.abs(y(open) - y(close))),
      bodyW,
      up,
    })
  }
  return list
})

const upColor = '#ef5350'
const downColor = '#26a69a'

// 评论标记：有期望价格的节点画竖虚线（收盘价连到目标价）+ 目标价横虚线；
// 无期望价格的节点画短竖线刻度
const pad2 = (v: number) => String(v).padStart(2, '0')
const commentMarksLayer = computed(() => {
  const empty = { verticals: [] as Array<{ x: number; y1: number; y2: number }>, horizontals: [] as Array<{ y: number }> }
  const chart = props.chart
  const marks = props.commentMarks
  if (!chart || !marks?.length) return empty
  const n = chart.timestamps.length
  if (!n) return empty
  const max = Math.max(...chart.high.filter(v => v != null), 0)
  if (max <= 0) return empty
  const byDate = new Map(marks.map(m => [m.date, m.targetPrice]))
  const slotW = CHART_W / n
  const y = (v: number) => CHART_H - (v / max) * CHART_H
  // 坐标钳制在图内，目标价超出量程时线指向边缘
  const clampY = (v: number) => Math.max(0, Math.min(CHART_H, y(v)))
  const verticals: Array<{ x: number; y1: number; y2: number }> = []
  const targets = new Set<number>()
  for (let i = 0; i < n; i++) {
    const ts = chart.timestamps[i]
    const close = chart.closes[i]
    if (ts == null || close == null) continue
    const d = new Date(ts)
    const ds = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    if (!byDate.has(ds)) continue
    const x = (i + 0.5) * slotW
    const target = byDate.get(ds)
    if (target != null && target > 0) {
      verticals.push({ x, y1: clampY(close), y2: clampY(target) })
      targets.add(target)
    } else {
      const yc = clampY(close)
      verticals.push({ x, y1: Math.max(0, yc - 6), y2: Math.min(CHART_H, yc + 6) })
    }
  }
  const horizontals = Array.from(targets).map(t => ({ y: clampY(t) }))
  return { verticals, horizontals }
})

// 底部横轴刻度：
// 月K 每年(1月)1 tick、每2年1 label；周K 标在3/6/9/12月最后一天、label 为该月（12月、3月…）；
// 日K 每月第一根K线 tick+label（label 为月份 8月、9月…）
const xAxisMarks = computed(() => {
  const chart = props.chart
  const n = chart?.timestamps.length ?? 0
  if (!chart || !n) return []
  const interval =
    chart.interval ||
    (chart.range === '10y' ? 'month' : chart.range === '3mo' ? 'day' : 'week')
  const marks: Array<{ xPercent: number; label?: string }> = []
  if (interval === 'month') {
    for (let i = 0; i < n; i++) {
      const date = new Date(chart.timestamps[i])
      if (date.getMonth() !== 0) continue
      const year = date.getFullYear()
      marks.push({
        xPercent: ((i + 0.5) / n) * 100,
        label: year % 2 === 0 ? String(year) : undefined,
      })
    }
  } else if (interval === 'week') {
    // 3/6/9/12 月的最后一根周K，每 tick 带月份 label（12月、3月…）
    const QUARTER_END_MONTHS = [2, 5, 8, 11]
    for (let i = 0; i < n; i++) {
      const date = new Date(chart.timestamps[i])
      if (!QUARTER_END_MONTHS.includes(date.getMonth())) continue
      const isLastOfMonth =
        i === n - 1 || new Date(chart.timestamps[i + 1]).getMonth() !== date.getMonth()
      if (!isLastOfMonth) continue
      marks.push({
        xPercent: ((i + 0.5) / n) * 100,
        label: `${date.getMonth() + 1}月`,
      })
    }
  } else {
    // 每月第一根日K（1号非交易日则取其后的第一根），label 为月份（8月、9月…）
    let lastMonthKey = -1
    for (let i = 0; i < n; i++) {
      const date = new Date(chart.timestamps[i])
      const monthKey = date.getFullYear() * 12 + date.getMonth()
      if (monthKey === lastMonthKey) continue
      lastMonthKey = monthKey
      marks.push({
        xPercent: ((i + 0.5) / n) * 100,
        label: `${date.getMonth() + 1}月`,
      })
    }
  }
  return marks
})

// 纵轴刻度：时间段内最高价、当前价（最新收盘）、最低价
const yAxisMarks = computed(() => {
  const chart = props.chart
  const n = chart?.timestamps.length ?? 0
  if (!chart || !n) return []
  const max = Math.max(...chart.high.filter(v => v != null), 0)
  if (max <= 0) return []
  const lows = chart.low.filter(v => v != null)
  const high = max
  const low = lows.length ? Math.min(...lows) : 0
  const current = chart.closes[n - 1]
  const marks: Array<{ topPercent: number; label: string; tag: string }> = []
  const seen = new Set<number>()
  const push = (value: number | null | undefined, tag: string) => {
    if (value == null || !Number.isFinite(value)) return
    const key = Math.round(value * 100) / 100
    if (seen.has(key)) return
    seen.add(key)
    marks.push({
      topPercent: (1 - value / max) * 100,
      label: key.toFixed(2),
      tag,
    })
  }
  push(high, 'high')
  push(current, 'current')
  push(low, 'low')
  return marks
})

// 点击/滑动选中蜡烛（触摸保留纵向滚动）
const svgRef = ref<SVGSVGElement | null>(null)
const dragging = ref(false)
// 竖线常驻：选中的蜡烛下标，数据到达/切换后默认最右边一根，抬起不清除
const selectedIndex = ref<number | null>(null)
// 提示框跟随指针，位于指针右下方 (20px, 20px)，不限定在图内；仅拖拽时展示
const pointerPos = ref<{ x: number; y: number } | null>(null)

const emit = defineEmits<{
  (e: 'update:selectedDate', date: string): void
}>()

// 数据到达或切换 K 线范围后，竖线默认选中最右边一根
watch(
  () => props.chart,
  () => {
    const n = props.chart?.timestamps.length ?? 0
    selectedIndex.value = n > 0 ? n - 1 : null
  },
  { immediate: true },
)

const selectAt = (clientX: number, clientY: number) => {
  const chart = props.chart
  const svg = svgRef.value
  if (!chart || !svg) return
  const n = chart.timestamps.length
  if (!n) return
  const rect = svg.getBoundingClientRect()
  if (!rect.width) return
  pointerPos.value = { x: clientX - rect.left, y: clientY - rect.top }
  const x = ((clientX - rect.left) / rect.width) * CHART_W
  const index = Math.max(0, Math.min(n - 1, Math.floor((x / CHART_W) * n)))
  selectedIndex.value = index
}

// 松开后只隐藏提示框，竖线保留在选中位置
const clearSelection = () => {
  dragging.value = false
  pointerPos.value = null
}

const onPointerDown = (e: PointerEvent) => {
  dragging.value = true
  try {
    svgRef.value?.setPointerCapture?.(e.pointerId)
  } catch {
    // 部分浏览器不支持/拒绝捕获，忽略
  }
  selectAt(e.clientX, e.clientY)
  // 兜底：移动端指针事件序列不可靠（pointerup 可能不派发），
  // 在 window 挂一次性监听，手指抬起（或手势被取消）必定清理
  window.addEventListener('pointerup', clearSelection, { once: true })
  window.addEventListener('pointercancel', clearSelection, { once: true })
}
const onPointerMove = (e: PointerEvent) => {
  if (!dragging.value) return
  selectAt(e.clientX, e.clientY)
}
const onPointerUp = (e: PointerEvent) => {
  clearSelection()
  try {
    svgRef.value?.releasePointerCapture?.(e.pointerId)
  } catch {
    // 捕获可能已被浏览器隐式释放
  }
}

const selectedInfo = computed(() => {
  const chart = props.chart
  const n = chart?.timestamps.length ?? 0
  // 下标兜底钳制，避免数据变化后越界
  const index = selectedIndex.value == null ? n - 1 : Math.min(selectedIndex.value, n - 1)
  if (!chart || n === 0 || index < 0) return null
  const open = chart.opens[index]
  const close = chart.closes[index]
  const high = chart.high[index]
  const low = chart.low[index]
  const ts = chart.timestamps[index]
  if (open == null || close == null || high == null || low == null || ts == null) {
    return null
  }
  const d = new Date(ts)
  const prevClose = index > 0 ? chart.closes[index - 1] : null
  const change = prevClose != null ? close - prevClose : null
  const changePercent = prevClose ? (change! / prevClose) * 100 : null
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    open,
    close,
    high,
    low,
    change,
    changePercent,
    xPercent: ((index + 0.5) / chart.timestamps.length) * 100,
    up: change == null ? close >= open : change >= 0,
  }
})

// 把竖线选中的日期同步给父组件（评论时间用）
watch(
  () => selectedInfo.value?.date,
  date => {
    if (date) emit('update:selectedDate', date)
  },
)

const tooltipStyle = computed(() => {
  if (!selectedInfo.value || !pointerPos.value) return undefined
  const offsetX = Number(props.tooltipOffset?.x) || 20
  const offsetY = Number(props.tooltipOffset?.y) || 20
  return {
    left: `${pointerPos.value.x + offsetX}px`,
    top: `${pointerPos.value.y + offsetY}px`,
  }
})
</script>

<template>
  <div class="kline-chart">
    <svg
      ref="svgRef"
      class="chart-svg"
      :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
      preserveAspectRatio="none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <g v-for="(c, i) in candles" :key="i">
        <line
          :x1="c.mid"
          :x2="c.mid"
          :y1="c.highY"
          :y2="c.lowY"
          :stroke="c.up ? upColor : downColor"
          stroke-width="1"
        />
        <rect
          :x="c.mid - c.bodyW / 2"
          :y="c.bodyY"
          :width="c.bodyW"
          :height="c.bodyH"
          :fill="c.up ? upColor : downColor"
        />
      </g>
      <line
        v-for="(h, i) in commentMarksLayer.horizontals"
        :key="`comment-h-${i}`"
        x1="0"
        :x2="CHART_W"
        :y1="h.y"
        :y2="h.y"
        stroke="var(--primary-color)"
        stroke-width="0.6"
        stroke-dasharray="3 3"
        opacity="0.4"
      />
      <line
        v-for="(v, i) in commentMarksLayer.verticals"
        :key="`comment-v-${i}`"
        :x1="v.x"
        :x2="v.x"
        :y1="v.y1"
        :y2="v.y2"
        stroke="var(--primary-color)"
        stroke-width="0.8"
        stroke-dasharray="3 3"
        opacity="0.5"
      />
      <line
        v-if="selectedInfo"
        :x1="selectedInfo.xPercent * (CHART_W / 100)"
        :x2="selectedInfo.xPercent * (CHART_W / 100)"
        y1="0"
        :y2="CHART_H"
        stroke="var(--text-secondary)"
        stroke-width="0.5"
        stroke-dasharray="2 2"
        opacity="0.6"
      />
    </svg>
    <div class="y-axis-layer">
      <div
        v-for="m in yAxisMarks"
        :key="`y-axis-${m.tag}`"
        class="y-axis-mark"
        :style="{ top: m.topPercent + '%' }"
      >
        <span class="y-axis-line"></span>
        <span class="y-axis-label">{{ m.label }}</span>
      </div>
    </div>
    <div class="axis-layer">
      <div
        v-for="(m, i) in xAxisMarks"
        :key="`axis-${i}`"
        class="axis-mark"
        :style="{ left: m.xPercent + '%' }"
      >
        <span class="axis-line"></span>
        <span v-if="m.label" class="axis-label">{{ m.label }}</span>
      </div>
    </div>
    <div v-if="selectedInfo && pointerPos" class="chart-tooltip" :style="tooltipStyle">
      <div class="tooltip-row">
        <span class="tooltip-date">{{ selectedInfo.date }}</span>
        <span
          class="tooltip-close"
          :style="{ color: selectedInfo.up ? upColor : downColor }"
          >{{ selectedInfo.close.toFixed(2) }}</span
        >
        <span
          v-if="selectedInfo.changePercent != null"
          :style="{ color: selectedInfo.up ? upColor : downColor }"
          >{{ selectedInfo.change >= 0 ? '+' : '' }}{{ selectedInfo.changePercent.toFixed(2) }}%</span
        >
      </div>
      <div class="tooltip-row tooltip-detail">
        <span>开 {{ selectedInfo.open.toFixed(2) }}</span>
        <span>高 {{ selectedInfo.high.toFixed(2) }}</span>
        <span>低 {{ selectedInfo.low.toFixed(2) }}</span>
      </div>
    </div>
    <div v-if="!candles.length" class="chart-empty">
      {{ loading ? '加载中…' : '暂无数据' }}
    </div>
  </div>
</template>

<style lang="less" scoped>
.kline-chart {
  position: relative;
  width: 100%;
  height: 100%;

  .chart-svg {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: pan-y;
    cursor: crosshair;
  }

  .y-axis-layer {
    position: absolute;
    top: 0;
    bottom: 12px;
    left: 0;
    pointer-events: none;
  }

  .y-axis-mark {
    position: absolute;
    left: 0;
    transform: translateY(-50%);

    .y-axis-line {
      display: block;
      width: 4px;
      height: 1px;
      background: var(--text-secondary);
      opacity: 0.5;
    }

    .y-axis-label {
      position: absolute;
      left: 5px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 9px;
      line-height: 1;
      white-space: nowrap;
      color: var(--text-secondary);
      opacity: 0.8;
    }
  }

  .axis-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 12px;
    pointer-events: none;
  }

  .axis-mark {
    position: absolute;
    bottom: 0;
    height: 100%;

    .axis-line {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 1px;
      height: 4px;
      background: var(--text-secondary);
      opacity: 0.5;
    }

    .axis-label {
      position: absolute;
      left: 0;
      bottom: 3px;
      font-size: 9px;
      line-height: 1;
      white-space: nowrap;
      color: var(--text-secondary);
      opacity: 0.8;
      transform: translateX(-50%);
    }
  }

  .chart-tooltip {
    position: absolute;
    padding: 0.2rem 0.45rem;
    border-radius: 0.4rem;
    background: var(--card-bg);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;

    .tooltip-row {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.1rem;

      &.tooltip-detail {
        color: var(--text-secondary);
      }
    }

    .tooltip-date {
      color: var(--text-secondary);
    }

    .tooltip-close {
      font-weight: 600;
    }
  }

  .chart-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--text-secondary);
  }
}
</style>
