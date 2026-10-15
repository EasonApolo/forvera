<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MarketChartResult } from 'shared/types/stock'

const props = defineProps<{
  chart: MarketChartResult | null
  loading?: boolean
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

// 点击/滑动选中蜡烛（触摸保留纵向滚动）
const svgRef = ref<SVGSVGElement | null>(null)
const dragging = ref(false)
const selectedIndex = ref<number | null>(null)
// 提示框跟随指针，位于指针右下方 (20px, 20px)，不限定在图内
const pointerPos = ref<{ x: number; y: number } | null>(null)

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

const onPointerDown = (e: PointerEvent) => {
  dragging.value = true
  svgRef.value?.setPointerCapture?.(e.pointerId)
  selectAt(e.clientX, e.clientY)
}
const onPointerMove = (e: PointerEvent) => {
  if (!dragging.value) return
  selectAt(e.clientX, e.clientY)
}
const onPointerUp = (e: PointerEvent) => {
  dragging.value = false
  // 松开后隐藏提示框与选中线；拖动期间已 setPointerCapture，移出图表仍持续选中
  selectedIndex.value = null
  pointerPos.value = null
  svgRef.value?.releasePointerCapture?.(e.pointerId)
}

const pad2 = (v: number) => String(v).padStart(2, '0')
const selectedInfo = computed(() => {
  const chart = props.chart
  const index = selectedIndex.value
  if (!chart || index == null) return null
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

const tooltipStyle = computed(() => {
  if (!selectedInfo.value || !pointerPos.value) return undefined
  return {
    left: `${pointerPos.value.x + 20}px`,
    top: `${pointerPos.value.y + 20}px`,
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
    <div v-if="selectedInfo" class="chart-tooltip" :style="tooltipStyle">
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
