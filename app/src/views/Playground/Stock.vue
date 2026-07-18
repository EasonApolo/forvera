<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { request } from '@/utils/request'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import HorizontalScroll from '@/components/layout/HorizontalScroll.vue'
import EditableInput from '@/components/EditableInput.vue'
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import Input from '@/components/Input.vue'
import Modal from '@/components/Modal.vue'

import type { MarketChart, MarketItem } from 'shared/types/stock'

const router = useRouter()
const rangeOptions = [
  { key: '1d', label: '1天' },
  { key: '5d', label: '5天' },
  { key: '1mo', label: '1月' },
  { key: '1y', label: '1年' },
  { key: '5y', label: '5年' },
  { key: '10y', label: '10年' },
  { key: 'max', label: '全部' },
]
const watchlist = ref<MarketItem[]>([])
const groups = ref<Array<{ id: string; name: string }>>([])
const activeGroupId = ref<string | null>(null)
const selectedSymbol = ref('')
const chartRange = ref('1mo')
const loading = reactive({ page: false, chart: false, search: false })
const chartData = ref<MarketChart | null>(null)
const chartError = ref('')
const chartCache = new Map<string, { data: MarketChart; expiresAt: number }>()
const searchModal = reactive({
  show: false,
  query: '',
  results: [] as MarketItem[],
  selected: null as MarketItem | null,
})
const detailModal = reactive({ show: false, item: null as MarketItem | null })
let searchTimer: ReturnType<typeof setTimeout> | null = null
let chartRequestId = 0
const navItems = [
  { key: 'back', label: '‹ 返回' },
  { key: 'add', label: '添加' },
]

const selectedItem = computed(() => {
  const item = watchlist.value.find(it => it.symbol === selectedSymbol.value)
  return item || watchlist.value[0] || null
})

const detailTitle = computed(() => {
  if (!detailModal.item) return '标的详情'
  return `${detailModal.item.name} (${detailModal.item.symbol})`
})

const chartCacheKey = (symbol: string, range: string) => `${symbol.toUpperCase()}#${range}`

function loadChartCache() {
  try {
    const raw = localStorage.getItem('marketChartCache')
    if (!raw) return
    const parsed = JSON.parse(raw) as Array<{ key: string; data: MarketChart; expiresAt: number }>
    const now = Date.now()
    parsed.forEach(item => {
      if (item.expiresAt > now) {
        chartCache.set(item.key, { data: item.data, expiresAt: item.expiresAt })
      }
    })
  } catch {
    // ignore malformed cache
  }
}

function saveChartCache() {
  try {
    const items = Array.from(chartCache.entries()).map(([key, value]) => ({ key, ...value }))
    localStorage.setItem('marketChartCache', JSON.stringify(items))
  } catch {
    // ignore localStorage failures
  }
}

function loadWatchlist() {
  try {
    const raw = localStorage.getItem('marketWatchlist')
    if (raw) {
      const parsed = JSON.parse(raw) as MarketItem[]
      watchlist.value = parsed
        .filter(item => item.symbol)
        .map((item, index) => ({
          ...item,
          order: item.order ?? index + 1,
          remark: item.remark ?? '',
        }))
    }
  } catch {
    watchlist.value = []
  }

  if (!watchlist.value.length) {
    watchlist.value = [
      { symbol: 'AAPL', name: 'Apple', type: '股票', exchange: 'NASDAQ', currency: 'USD' },
      { symbol: 'GOOGL', name: 'Alphabet', type: '股票', exchange: 'NASDAQ', currency: 'USD' },
      { symbol: 'SPY', name: '标普500 ETF', type: '基金', exchange: 'NYSEARCA', currency: 'USD' },
      { symbol: 'GC=F', name: '黄金', type: '贵金属', exchange: 'COMEX', currency: 'USD' },
      { symbol: 'CL=F', name: '原油', type: '能源', exchange: 'NYMEX', currency: 'USD' },
    ]
  }

  watchlist.value = watchlist.value.map((item, index) => ({
    ...item,
    order: item.order ?? index + 1,
    remark: item.remark ?? '',
  }))

  const lastSymbol = localStorage.getItem('marketLastSymbol')
  selectedSymbol.value =
    lastSymbol && watchlist.value.some(item => item.symbol === lastSymbol)
      ? lastSymbol
      : watchlist.value[0]?.symbol || ''
}

function saveWatchlist() {
  localStorage.setItem('marketWatchlist', JSON.stringify(watchlist.value))
  localStorage.setItem('marketLastSymbol', selectedSymbol.value)
}

function loadGroupState() {
  try {
    const rawGroups = localStorage.getItem('marketGroups')
    groups.value = rawGroups ? (JSON.parse(rawGroups) as Array<{ id: string; name: string }>) : []
  } catch {
    groups.value = []
  }
}

function saveGroupState() {
  localStorage.setItem('marketGroups', JSON.stringify(groups.value))
}

const chartWidth = 320
const chartHeight = 120
const labelMinWidth = 64
const maxChartLabels = Math.max(2, Math.min(6, Math.floor(chartWidth / labelMinWidth)))

const isStockInGroup = (item: MarketItem, groupId: string) => item.groupId === groupId

const groupedStocks = computed(() => {
  return groups.value.map(group => ({
    group,
    items: watchlist.value.filter(item => isStockInGroup(item, group.id)),
  }))
})

const ungroupedStocks = computed(() => {
  return watchlist.value.filter(item => !item.groupId)
})

const currentGroup = computed(
  () => groups.value.find(group => group.id === activeGroupId.value) || null
)

const currentGroupStocks = computed(() => {
  if (!activeGroupId.value) return []
  return watchlist.value
    .filter(item => isStockInGroup(item, activeGroupId.value!))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
})

const validChartPoints = computed(() => {
  if (!chartData.value) return [] as Array<{ timestamp: number; price: number; index: number }>
  return chartData.value.timestamps
    .map((timestamp, index) => ({ timestamp, price: chartData.value!.closes[index], index }))
    .filter(point => point.price != null && point.price !== 0)
})

const chartPoints = computed(() => {
  const points = validChartPoints.value
  if (!points.length)
    return [] as Array<{ timestamp: number; price: number; index: number; x: number; y: number }>
  const prices = points.map(point => point.price)
  const max = Math.max(...prices)
  const min = Math.min(...prices)
  const range = Math.max(1, max - min)
  const stepX = chartWidth / Math.max(1, points.length - 1)
  return points.map((point, index) => ({
    ...point,
    x: Math.round(index * stepX),
    y: Math.round(chartHeight - ((point.price - min) / range) * chartHeight),
  }))
})

const hasChartData = computed(() => chartData.value !== null && chartPoints.value.length >= 2)
const latestPrice = computed(() => {
  if (!chartPoints.value.length) return null
  return chartPoints.value[chartPoints.value.length - 1].price
})
const currentChange = computed(() => {
  if (chartPoints.value.length < 2) return null
  const list = chartPoints.value
  return list[list.length - 1].price - list[list.length - 2].price
})
const currentChangePercent = computed(() => {
  if (chartPoints.value.length < 2) return null
  const change = currentChange.value || 0
  const prev = chartPoints.value[chartPoints.value.length - 2].price
  return prev ? (change / prev) * 100 : 0
})

const svgPath = computed(() => {
  const points = chartPoints.value
  if (!points.length) return ''
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
})

const openPrice = computed(() => chartPoints.value[0]?.price ?? null)
const openLineY = computed(() => chartPoints.value[0]?.y ?? null)

const hoverPoint = ref<{ timestamp: number; price: number; x: number; y: number } | null>(null)

const visibleChartLabels = computed(() => {
  const points = chartPoints.value
  const length = points.length
  if (length <= maxChartLabels) {
    return points.map((point, filteredIndex) => ({
      timestamp: point.timestamp,
      leftPercent: (filteredIndex / Math.max(1, length - 1)) * 100,
    }))
  }
  const count = Math.min(maxChartLabels, length)
  const labels: Array<{ timestamp: number; leftPercent: number }> = []
  for (let i = 0; i < count; i += 1) {
    const idx = Math.round((i * (length - 1)) / (count - 1))
    labels.push({
      timestamp: points[idx].timestamp,
      leftPercent: (idx / Math.max(1, length - 1)) * 100,
    })
  }
  return labels
})

function onChartPointerMove(event: PointerEvent) {
  const wrapper = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.max(0, Math.min(wrapper.width, event.clientX - wrapper.left))
  const targetX = (x / wrapper.width) * chartWidth
  const points = chartPoints.value
  if (!points.length) return
  let nearest = points[0]
  let bestDelta = Math.abs(points[0].x - targetX)
  for (const point of points) {
    const delta = Math.abs(point.x - targetX)
    if (delta < bestDelta) {
      bestDelta = delta
      nearest = point
    }
  }
  hoverPoint.value = nearest
}

function onChartPointerLeave() {
  hoverPoint.value = null
}

const rangeLabel = computed(() => {
  const option = rangeOptions.find(item => item.key === chartRange.value)
  return option?.label || chartRange.value
})

const formatChartLabel = (timestamp: number) => {
  const date = new Date(timestamp)
  if (chartRange.value === '1d' || chartRange.value === '5d') {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

function initMarketState() {
  loadChartCache()
  loadWatchlist()
  loadGroupState()
  const lastSymbol = localStorage.getItem('marketLastSymbol')
  if (lastSymbol && watchlist.value.some(item => item.symbol === lastSymbol)) {
    selectedSymbol.value = lastSymbol
  }
  if (selectedSymbol.value) {
    fetchChart(selectedSymbol.value, chartRange.value)
  }
}

async function fetchChart(symbol: string, range: string) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  if (!normalizedSymbol) {
    chartData.value = null
    chartError.value = ''
    return
  }

  const requestId = ++chartRequestId
  const cacheKey = chartCacheKey(normalizedSymbol, range)
  const now = Date.now()
  const cached = chartCache.get(cacheKey)

  loading.chart = true
  chartError.value = ''

  try {
    if (cached && cached.expiresAt > now) {
      chartData.value = cached.data
      return
    }

    const data = await request('market/chart', 'GET', { symbol: normalizedSymbol, range })
    if (requestId !== chartRequestId) return

    chartData.value = data as MarketChart
    chartCache.set(cacheKey, {
      data: chartData.value,
      expiresAt: now + 5 * 60 * 1000,
    })
    saveChartCache()
  } catch (error) {
    if (requestId !== chartRequestId) return
    chartData.value = null
    chartError.value = error instanceof Error ? error.message : '图表加载失败'
  } finally {
    if (requestId === chartRequestId) {
      loading.chart = false
    }
  }
}

async function searchSymbols(query: string) {
  loading.search = true
  try {
    const data = await request('market/search', 'GET', { q: query })
    searchModal.results = Array.isArray(data) ? data : []
  } finally {
    loading.search = false
  }
}

function openAddModal() {
  searchModal.show = true
  searchModal.query = ''
  searchModal.results = []
}

function closeAddModal() {
  searchModal.show = false
}

function openDetailModal(item: MarketItem) {
  detailModal.item = item
  detailModal.show = true
  selectedSymbol.value = item.symbol
  chartData.value = null
  chartError.value = ''
  fetchChart(item.symbol, chartRange.value)
}

function closeDetailModal() {
  detailModal.show = false
}

function selectRange(range: string) {
  chartRange.value = range
  if (detailModal.item) {
    fetchChart(detailModal.item.symbol, range)
  } else if (selectedSymbol.value) {
    fetchChart(selectedSymbol.value, range)
  }
}

function addWatchItem(item: MarketItem) {
  if (!item?.symbol) return
  const exists = watchlist.value.some(it => it.symbol === item.symbol)
  if (!exists) {
    watchlist.value.unshift({
      ...item,
      order: watchlist.value.length + 1,
      groupId: activeGroupId.value || undefined,
      remark: item.remark || '',
    })
    saveWatchlist()
  }
  searchModal.show = false
  selectedSymbol.value = item.symbol
  fetchChart(item.symbol, chartRange.value)
}

function removeWatchItem(symbol: string) {
  watchlist.value = watchlist.value.filter(it => it.symbol !== symbol)
  saveWatchlist()
  if (selectedSymbol.value === symbol) {
    selectedSymbol.value = watchlist.value[0]?.symbol || ''
    if (selectedSymbol.value) {
      fetchChart(selectedSymbol.value, chartRange.value)
    }
  }
}

function addGroup() {
  const id = `group-${Date.now()}`
  groups.value.push({ id, name: '新分组' })
  saveGroupState()
  activeGroupId.value = id
}

function removeGroup(groupId: string) {
  const index = groups.value.findIndex(group => group.id === groupId)
  if (index >= 0) {
    groups.value.splice(index, 1)
    watchlist.value.forEach(item => {
      if (item.groupId === groupId) {
        item.groupId = undefined
      }
    })
    saveWatchlist()
    saveGroupState()
    if (activeGroupId.value === groupId) {
      activeGroupId.value = null
    }
  }
}

function confirmRemoveGroup(groupId: string) {
  if (window.confirm('确认解散该分组？该分组内的标的不会被删除。')) {
    removeGroup(groupId)
  }
}

function updateGroupName(groupId: string, name: string) {
  const group = groups.value.find(item => item.id === groupId)
  if (group) {
    group.name = name
    saveGroupState()
  }
}

function openGroup(groupId: string) {
  activeGroupId.value = groupId
}

function closeGroupView() {
  activeGroupId.value = null
}

function submitCurrentGroupName(value: string) {
  if (!currentGroup.value) return
  updateGroupName(currentGroup.value.id, value)
}

function cancelCurrentGroupName() {
  if (!currentGroup.value) return
  updateGroupName(currentGroup.value.id, currentGroup.value.name)
}

function toggleStockGroup(symbol: string, groupId: string) {
  if (!detailModal.item) return
  const item = watchlist.value.find(it => it.symbol === symbol)
  if (!item) return
  if (item.groupId === groupId) {
    item.groupId = undefined
  } else {
    item.groupId = groupId
  }
  saveWatchlist()
}

watch(
  () => searchModal.query,
  value => {
    if (searchTimer) {
      clearTimeout(searchTimer)
    }
    searchTimer = setTimeout(() => {
      if (value.trim()) {
        searchSymbols(value.trim())
      } else {
        searchModal.results = []
      }
    }, 300)
  }
)

onMounted(() => {
  initMarketState()
})

function gotoPlayground() {
  router.push({ name: 'playground' })
}

function handleNavSelect(key: string) {
  if (key === 'back') {
    gotoPlayground()
  } else if (key === 'add') {
    openAddModal()
  }
}

const currentDetail = computed(() => {
  const points = validChartPoints.value
  if (!points.length) return null
  const last = points[points.length - 1].price
  const prev = points[points.length - 2]?.price
  return {
    price: last,
    change: prev != null ? last - prev : 0,
    changePercent: prev ? ((last - prev) / prev) * 100 : 0,
  }
})

const infoLabels = computed(() => {
  if (!chartData.value) return []
  const lastIndex = chartData.value.closes.length - 1
  const lastClose = chartData.value.closes[lastIndex]
  const lastOpen = chartData.value.opens[lastIndex]
  const lastHigh = chartData.value.high[lastIndex]
  const lastLow = chartData.value.low[lastIndex]
  return [
    {
      label: '最新',
      value: lastClose != null ? `${lastClose.toFixed(2)} ${chartData.value.currency || ''}` : '-',
    },
    { label: '开盘', value: lastOpen != null ? `${lastOpen.toFixed(2)}` : '-' },
    { label: '最高', value: lastHigh != null ? `${lastHigh.toFixed(2)}` : '-' },
    { label: '最低', value: lastLow != null ? `${lastLow.toFixed(2)}` : '-' },
  ]
})
</script>

<template>
  <div class="market-page">
    <PageHeader>
      <template #right>
        <Btn type="primary" small @click="addGroup">添加分组</Btn>
      </template>
    </PageHeader>

    <div class="market-content">
      <div v-if="activeGroupId" class="group-switch-bar">
        <HorizontalScroll>
          <Btn
            small
            :type="currentGroup?.id === activeGroupId ? 'primary' : ''"
            v-for="group in groups"
            :key="group.id"
            @click="openGroup(group.id)"
          >
            {{ group.name }}
          </Btn>
          <Btn type="text" small @click="closeGroupView">未分组</Btn>
        </HorizontalScroll>
      </div>

      <div v-if="activeGroupId" class="stock-list">
        <Card v-if="currentGroup" class="group-card">
          <EditableInput
            v-model="currentGroup.name"
            @submit="submitCurrentGroupName"
            @cancel="cancelCurrentGroupName"
          />
          <div class="group-card-actions">
            <Btn class="group-remove" type="text" @click.stop="confirmRemoveGroup(currentGroup.id)">
              解散
            </Btn>
          </div>
        </Card>
        <div
          v-for="item in currentGroupStocks"
          :key="item.symbol"
          class="stock-list-item"
          @click="openDetailModal(item)"
        >
          <div class="stock-item-main">
            <div class="stock-item-name">{{ item.name }}</div>
            <div class="stock-item-symbol">{{ item.symbol }}</div>
          </div>
          <div class="stock-item-meta">
            <span>{{ item.type }} · {{ item.exchange || '未知' }}</span>
            <span class="stock-item-price">{{
              item.lastPrice != null ? item.lastPrice.toFixed(2) : '—'
            }}</span>
          </div>
        </div>
      </div>

      <div v-else class="stock-list">
        <div
          v-for="item in ungroupedStocks"
          :key="item.symbol"
          class="stock-list-item"
          @click="openDetailModal(item)"
        >
          <div class="stock-item-main">
            <div class="stock-item-name">{{ item.name }}</div>
            <div class="stock-item-symbol">{{ item.symbol }}</div>
          </div>
          <div class="stock-item-meta">
            <span>{{ item.type }} · {{ item.exchange || '未知' }}</span>
            <span class="stock-item-price">{{
              item.lastPrice != null ? item.lastPrice.toFixed(2) : '—'
            }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <BottomNavBar :items="navItems" @select="handleNavSelect" />

  <Modal
    :title="detailTitle"
    :show="detailModal.show"
    @update:show="value => (detailModal.show = value)"
    cancelText="关闭"
    :hideFooter="true"
  >
    <div class="detail-modal">
      <div class="detail-summary">
        <div class="detail-price">
          {{ currentDetail?.price != null ? currentDetail.price.toFixed(2) : '加载中...' }}
        </div>
        <div class="detail-change" :class="{ positive: (currentDetail?.change ?? 0) >= 0, negative: (currentDetail?.change ?? 0) < 0 }">
          {{
            currentDetail?.change != null
              ? (currentDetail.change >= 0 ? '+' : '') + currentDetail.change.toFixed(2)
              : '—'
          }}
          <span v-if="currentDetail?.changePercent != null"
            >({{ currentDetail.changePercent >= 0 ? '+' : ''
            }}{{ currentDetail.changePercent.toFixed(2) }}%)</span
          >
        </div>
      </div>
      <div class="range-bar">
        <div
          v-for="option in rangeOptions"
          :key="option.key"
          class="range-button"
          :class="{ active: chartRange === option.key }"
          @click="selectRange(option.key)"
        >
          {{ option.label }}
        </div>
      </div>
      <div class="chart-panel">
        <div v-if="loading.chart" class="chart-loading">加载中...</div>
        <div v-else>
          <div v-if="chartError" class="chart-error">{{ chartError }}</div>
          <div v-if="!hasChartData" class="chart-empty">暂无图表数据</div>
          <div
            v-if="hasChartData"
            class="chart-interactive"
            @pointerdown="onChartPointerMove"
            @pointermove="onChartPointerMove"
            @pointerleave="onChartPointerLeave"
            @pointercancel="onChartPointerLeave"
          >
            <svg class="chart-svg" viewBox="0 0 320 120" preserveAspectRatio="none">
              <line
                v-if="openLineY !== null"
                x1="0"
                :y1="openLineY"
                x2="320"
                :y2="openLineY"
                stroke="var(--text-secondary)"
                stroke-width="1"
                stroke-dasharray="4 4"
              />
              <path :d="svgPath" fill="none" stroke="var(--accent-color)" stroke-width="1.5" />
              <g v-if="hoverPoint">
                <line
                  :x1="hoverPoint.x"
                  y1="0"
                  :x2="hoverPoint.x"
                  y2="120"
                  stroke="rgba(136, 136, 136, 0.35)"
                  stroke-width="1"
                  stroke-dasharray="3 3"
                />
                <circle
                  :cx="hoverPoint.x"
                  :cy="hoverPoint.y"
                  r="3"
                  fill="var(--accent-color)"
                  stroke="#fff"
                  stroke-width="1"
                />
              </g>
            </svg>
            <div
              v-if="hoverPoint"
              class="chart-tooltip"
              :style="{
                left: `${(hoverPoint.x / chartWidth) * 100}%`,
                top: `${hoverPoint.y - 44}px`,
              }"
            >
              <div>{{ formatChartLabel(hoverPoint.timestamp) }}</div>
              <div>{{ hoverPoint.price.toFixed(2) }}</div>
            </div>
          </div>
          <div v-if="hasChartData" class="chart-labels">
            <div
              v-for="point in visibleChartLabels"
              :key="point.timestamp"
              class="chart-label"
              :style="{ left: `${point.leftPercent}%` }"
            >
              {{ formatChartLabel(point.timestamp) }}
            </div>
          </div>
        </div>
      </div>
      <div class="group-selector">
        <div class="panel-title">分组</div>
        <HorizontalScroll>
          <div
            v-for="group in groups"
            :key="group.id"
            class="group-chip"
            :class="{ active: detailModal.item && isStockInGroup(detailModal.item, group.id) }"
            @click="detailModal.item && toggleStockGroup(detailModal.item.symbol, group.id)"
          >
            {{ group.name }}
          </div>
          <Btn class="group-chip-add" type="text" @click="addGroup">+ 新分组</Btn>
        </HorizontalScroll>
      </div>
      <div class="market-info">
        <div class="panel-title">详情</div>
        <div class="info-grid">
          <div v-for="info in infoLabels" :key="info.label" class="info-cell">
            <div class="info-label">{{ info.label }}</div>
            <div class="info-value">{{ info.value }}</div>
          </div>
        </div>
      </div>
    </div>
  </Modal>

  <Modal
    title="添加标的"
    :show="searchModal.show"
    @update:show="value => (searchModal.show = value)"
    cancelText="取消"
    confirmText="添加"
    :hideFooter="true"
  >
    <div class="search-modal">
      <Input v-model="searchModal.query" placeholder="输入股票/基金/商品代码或名称" />
      <div class="search-results">
        <div v-if="loading.search" class="search-loading">搜索中...</div>
        <div v-else-if="!searchModal.results.length" class="search-empty">请输入关键字开始搜索</div>
        <div v-else>
          <div
            v-for="item in searchModal.results"
            :key="item.symbol"
            class="search-item"
            @click="addWatchItem(item)"
          >
            <div>
              <div class="search-item-title">{{ item.name }}</div>
              <div class="search-item-subtitle">
                {{ item.symbol }} · {{ item.exchange || item.type }}
              </div>
            </div>
            <div class="search-item-type">{{ item.type }}</div>
          </div>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped lang="less">
.market-page {
  padding: 1rem 0.75rem 7rem;
}

.market-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.market-title {
  font-size: 1.3rem;
  font-weight: 700;
}

.market-subtitle {
  margin-top: 0.35rem;
  color: var(--text-secondary);
}

.market-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.group-switch-bar {
  display: flex;
  width: 100%;
}

.group-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.group-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.75rem;
}

.group-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.group-card-main {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  cursor: pointer;
}

.group-card-meta {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.group-card-actions {
  display: flex;
  justify-content: flex-end;
}

.stock-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.stock-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--card-bg);
  border-radius: 1rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stock-list-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
}

.stock-item-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stock-item-name {
  font-size: 1rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-item-symbol {
  margin-top: 0.3rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.stock-item-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.stock-item-price {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
}

.panel-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
}

.watchlist {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.watchlist-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem;
  background: var(--card-bg);
  border-radius: 0.85rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.watchlist-item.active {
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.watchlist-item:hover {
  transform: translateY(-1px);
}

.watchlist-text {
  min-width: 0;
}

.watchlist-name {
  font-size: 0.95rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.watchlist-symbol {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.watchlist-price {
  font-size: 0.95rem;
  font-weight: 700;
  text-align: right;
}

.watchlist-remove {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-secondary);
  cursor: pointer;
}

.market-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.market-summary {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: var(--card-bg);
  border-radius: 1rem;
}

.stock-title {
  font-size: 1rem;
  font-weight: 700;
}

.stock-symbol {
  margin-top: 0.4rem;
  color: var(--text-secondary);
}

.stock-price-row {
  text-align: right;
}

.stock-price {
  font-size: 1.85rem;
  font-weight: 700;
}

.stock-change {
  margin-top: 0.3rem;
  font-size: 0.95rem;
}

.stock-change.positive {
  color: #16a34a;
}

.stock-change.negative {
  color: #ef4444;
}

.range-bar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.range-button {
  padding: 0.55rem 0.85rem;
  border-radius: 999px;
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.range-button.active {
  background: var(--accent-color);
  color: white;
}

.chart-panel {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border-radius: 1rem;
  padding: 1rem;
}

.chart-loading,
.chart-empty {
  color: var(--text-secondary);
}

.chart-interactive {
  position: relative;
  width: 100%;
  height: 120px;
  touch-action: pan-y;
}

.chart-svg {
  width: 100%;
  height: 100%;
}

.chart-tooltip {
  position: absolute;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 0.4rem 0.55rem;
  border-radius: 0.55rem;
  font-size: 0.75rem;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}

.chart-labels {
  position: relative;
  width: 100%;
  height: 24px;
  margin-top: 0.5rem;
}

.chart-label {
  position: absolute;
  bottom: 0;
  transform: translateX(-50%);
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.market-info {
  padding: 1rem;
  background: var(--card-bg);
  border-radius: 1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.info-cell {
  padding: 0.9rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.04);
}

.info-label {
  margin-bottom: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.info-value {
  font-weight: 600;
}

.search-modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.search-hint {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 320px;
  overflow-y: auto;
}

.search-item {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.95rem;
  border-radius: 0.85rem;
  background: var(--card-bg);
  cursor: pointer;
}

.search-item-title {
  font-weight: 600;
}

.search-item-subtitle {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.search-item-type {
  color: var(--text-secondary);
  white-space: nowrap;
}

@media (max-width: 960px) {
  .market-content {
    flex-direction: column;
  }

  .market-sidebar {
    width: 100%;
  }
}
</style>
