<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import List from '../../components/layout/List.vue'
import PageHeader from '../../components/layout/PageHeader.vue'
import HorizontalScroll from '../../components/layout/HorizontalScroll.vue'
import Btn from '../../components/Btn.vue'
import CircleBtn from '../../components/CircleBtn.vue'
import Modal from '../../components/Modal.vue'
import Input from '../../components/Input.vue'
import StockCard from '../../components/StockCard.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { request } from '../../utils/request'
import { useToastStore } from '../../store/toast'
import { useUserStore } from '../../store/user'
import type { ChartRange, MarketItem, MarketQuote, MarketSearchResult } from 'shared/types/stock'

const toastStore = useToastStore()
const userStore = useUserStore()
const router = useRouter()

const WATCHLIST_KEY = 'klineWatchlist'

// 当前选中的 K 线范围（日K/周K/月K），卡片 tab 与添加弹窗的迷你图共用
const currentRange = ref<ChartRange>('1y')

// 同时只展开一张卡片（空串 = 全部折叠）
const expandedSymbol = ref('')

// bottom navbar（与 Diet 一致：返回 + 添加）
const navItems = computed(() => [
  { key: 'back', label: '‹ 返回' },
  { key: 'add', label: '添加' },
])
const onBottomNavSelect = (key: string) => {
  if (key === 'back') {
    router.go(-1)
    return
  }
  if (key === 'add') {
    openAddModal()
  }
}

// watchlist：登录时存 user.settings.stock.watchlist（跨设备同步），
// 未登录退回 localStorage（换浏览器/清缓存会丢，登录后可恢复）
const watchlist = ref<MarketItem[]>([])
const sameWatchlist = (a: MarketItem[], b: MarketItem[]) =>
  a.length === b.length && a.every((item, i) => item.symbol === b[i]?.symbol)

const loadWatchlist = () => {
  try {
    const saved = localStorage.getItem(WATCHLIST_KEY)
    const parsed = saved ? JSON.parse(saved) : []
    watchlist.value = Array.isArray(parsed) ? parsed : []
  } catch {
    watchlist.value = []
  }
}
const saveWatchlist = () => {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist.value))
  if (userStore.isLogin) {
    // 服务端按 symbol+name 过滤校验后合并进 settings.stock，失败不影响本地
    userStore
      .updateSettings({ stock: { watchlist: watchlist.value } })
      .catch(e => console.error('sync watchlist failed', e))
  }
}

loadWatchlist()

// 用户信息（含 settings）异步到达后：服务端有数据则以服务端为准；
// 服务端为空而本地有数据 → 把本地备份到服务端
watch(
  () => userStore.userInfo.settings.stock?.watchlist,
  serverList => {
    if (!userStore.isLogin || !Array.isArray(serverList)) return
    if (serverList.length) {
      if (!sameWatchlist(serverList as MarketItem[], watchlist.value)) {
        watchlist.value = serverList as MarketItem[]
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist.value))
      }
    } else if (watchlist.value.length) {
      saveWatchlist()
    }
  }
)

const addStock = (item: MarketSearchResult) => {
  if (watchlist.value.some(it => it.symbol === item.symbol)) {
    toastStore.showToast({ content: '已添加过这个标的', type: '!' })
    return
  }
  watchlist.value.unshift({
    symbol: item.symbol,
    name: item.name,
    type: item.type,
    exchange: item.exchange,
    currency: item.currency,
    addedAt: Date.now(),
  })
  saveWatchlist()
  showAddModal.value = false
  toastStore.showToast({ content: `已添加 ${item.name}`, type: 'OK' })
}

const removeStock = (symbol: string) => {
  watchlist.value = watchlist.value.filter(it => it.symbol !== symbol)
  saveWatchlist()
}

// 列表排序：涨跌幅（需要实时报价，批量拉取）/ 默认（添加顺序）/ 类型
type SortKey = 'change' | 'default' | 'type'
const sortKey = ref<SortKey>('change')
const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'change', label: '涨跌幅' },
  { key: 'default', label: '默认' },
  { key: 'type', label: '类型' },
]

const quotes = ref<Record<string, MarketQuote | null>>({})
// 批量报价接口里 us 代码不带 .OQ 后缀，匹配时归一化
const normalizeSymbol = (s: string) =>
  s.startsWith('us') && s.includes('.') ? s.split('.')[0] : s
const quoteOf = (symbol: string) =>
  quotes.value[symbol] ?? quotes.value[normalizeSymbol(symbol)] ?? null

const loadQuotes = async () => {
  const symbols = watchlist.value.map(it => it.symbol)
  if (!symbols.length) {
    quotes.value = {}
    return
  }
  try {
    quotes.value = await request(
      `market/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`
    )
  } catch (e) {
    console.error(e)
  }
}
loadQuotes()
watch(
  () => watchlist.value.map(it => it.symbol).join(','),
  () => loadQuotes()
)

const sortedWatchlist = computed(() => {
  if (sortKey.value === 'default') return watchlist.value
  if (sortKey.value === 'type') {
    return [...watchlist.value].sort((a, b) =>
      (a.type || '').localeCompare(b.type || '', 'zh')
    )
  }
  // 涨跌幅降序，无报价的排最后
  return [...watchlist.value].sort(
    (a, b) =>
      (quoteOf(b.symbol)?.changePercent ?? -Infinity) -
      (quoteOf(a.symbol)?.changePercent ?? -Infinity)
  )
})

// search
const showAddModal = ref(false)
const searchQuery = ref('')
const searchResults = ref<MarketSearchResult[]>([])
const searchLoading = ref(false)
// 是否已对当前关键词执行过搜索（输入中/未搜索时不显示「没找到」）
const hasSearched = ref(false)
// 点击搜索结果后，在其右侧显示添加按钮
const selectedResultSymbol = ref('')

watch(searchQuery, () => {
  hasSearched.value = false
})

const doSearch = async (query: string) => {
  if (!query.trim()) {
    searchResults.value = []
    hasSearched.value = false
    return
  }
  searchLoading.value = true
  try {
    searchResults.value = await request(`market/search?q=${encodeURIComponent(query.trim())}`)
    selectedResultSymbol.value = ''
    hasSearched.value = true
  } catch (e) {
    console.error(e)
    searchResults.value = []
  }
  searchLoading.value = false
}

// 按回车才搜索（组件已过滤输入法选词的回车），避免输入过程请求过于频繁
const onSearchEnter = () => {
  if (searchLoading.value) return
  doSearch(searchQuery.value)
}

const openAddModal = () => {
  searchQuery.value = ''
  searchResults.value = []
  showAddModal.value = true
}

// settings：图表宽度 / 标签管理 / K线提示框位置（存 user.settings.stock）
const showSettingsModal = ref(false)
const chartWidthInput = ref('60')
const settingsTags = ref<string[]>([])
const tagInput = ref('')
const tooltipXInput = ref('20')
const tooltipYInput = ref('20')
const rangeDayInput = ref('60')
const rangeWeekInput = ref('52')
const rangeMonthInput = ref('120')
const settingsSaving = ref(false)
const DEFAULT_TAGS = ['看涨', '看跌', '长期', '短期']
const DEFAULT_DATA_RANGE = { day: 60, week: 52, month: 120 }
const currentChartWidth = computed(() => {
  const w = Number(userStore.userInfo.settings.stock?.chartWidth)
  return Number.isFinite(w) && w >= 10 && w <= 90 ? w : 60
})
const currentTooltipOffset = computed(() => ({
  x: Number(userStore.userInfo.settings.stock?.tooltipOffset?.x) || 20,
  y: Number(userStore.userInfo.settings.stock?.tooltipOffset?.y) || 20,
}))
const currentDataRange = computed(() => ({
  day: Number(userStore.userInfo.settings.stock?.dataRange?.day) || DEFAULT_DATA_RANGE.day,
  week: Number(userStore.userInfo.settings.stock?.dataRange?.week) || DEFAULT_DATA_RANGE.week,
  month: Number(userStore.userInfo.settings.stock?.dataRange?.month) || DEFAULT_DATA_RANGE.month,
}))

const openSettingsModal = () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能保存设置', type: '!' })
    return
  }
  chartWidthInput.value = String(currentChartWidth.value)
  const savedTags = userStore.userInfo.settings.stock?.tags
  settingsTags.value = savedTags?.length ? [...savedTags] : [...DEFAULT_TAGS]
  tagInput.value = ''
  tooltipXInput.value = String(currentTooltipOffset.value.x)
  tooltipYInput.value = String(currentTooltipOffset.value.y)
  rangeDayInput.value = String(currentDataRange.value.day)
  rangeWeekInput.value = String(currentDataRange.value.week)
  rangeMonthInput.value = String(currentDataRange.value.month)
  showSettingsModal.value = true
}

const addTag = () => {
  const tag = tagInput.value.trim()
  if (!tag) {
    toastStore.showToast({ content: '标签不能为空', type: '!' })
    return
  }
  if (settingsTags.value.includes(tag)) {
    toastStore.showToast({ content: '标签已存在', type: '!' })
    return
  }
  settingsTags.value.push(tag)
  tagInput.value = ''
}

const removeTag = (tag: string) => {
  if (!confirm(`确定删除标签「${tag}」吗？`)) return
  settingsTags.value = settingsTags.value.filter(t => t !== tag)
}

const saveSettings = async () => {
  const w = Number(chartWidthInput.value)
  if (!Number.isFinite(w) || w < 10 || w > 90) {
    toastStore.showToast({ content: '请输入 10~90 之间的数值', type: '!' })
    return
  }
  const x = Number(tooltipXInput.value)
  const y = Number(tooltipYInput.value)
  const parseRange = (raw: string, def: number) => {
    const n = Number(raw)
    return Number.isFinite(n) && raw.trim() !== '' ? Math.round(n) : def
  }
  settingsSaving.value = true
  try {
    await userStore.updateSettings({
      stock: {
        chartWidth: Math.round(w),
        tags: settingsTags.value,
        tooltipOffset: {
          x: Number.isFinite(x) ? Math.round(x) : 20,
          y: Number.isFinite(y) ? Math.round(y) : 20,
        },
        dataRange: {
          day: parseRange(rangeDayInput.value, DEFAULT_DATA_RANGE.day),
          week: parseRange(rangeWeekInput.value, DEFAULT_DATA_RANGE.week),
          month: parseRange(rangeMonthInput.value, DEFAULT_DATA_RANGE.month),
        },
      },
    })
    showSettingsModal.value = false
    toastStore.showToast({ content: '设置已保存', type: 'OK' })
  } catch (e) {
    toastStore.showToast({ content: '设置保存失败', type: 'ERR' })
  }
  settingsSaving.value = false
}
</script>

<template>
  <List>
    <template v-slot:content>
      <PageHeader>
        <template #left>
          <div class="sort-btns">
            <Btn
              v-for="opt in sortOptions"
              :key="opt.key"
              size="small"
              :type="sortKey === opt.key ? 'primary' : undefined"
              @click="sortKey = opt.key"
              >{{ opt.label }}</Btn
            >
          </div>
        </template>
        <template #right>
          <Btn size="small" @click="openSettingsModal">设置</Btn>
        </template>
      </PageHeader>
      <StockCard
        v-for="item in sortedWatchlist"
        :key="item.symbol"
        :symbol="item.symbol"
        :name="item.name"
        v-model:range="currentRange"
        :expanded="expandedSymbol === item.symbol"
        @update:expanded="value => (expandedSymbol = value ? item.symbol : '')"
        @remove="removeStock(item.symbol)"
      />
      <div v-if="!watchlist.length" class="stock-empty">还没有添加标的，点下方「添加」开始吧～</div>
      <BottomNavBar :items="navItems" @select="onBottomNavSelect" />
    </template>
  </List>

  <Modal
    :show="showAddModal"
    @update:show="showAddModal = $event"
    title="添加标的"
    :hide-footer="true"
  >
    <div class="search-row">
      <Input
        v-model="searchQuery"
        placeholder="输入代码或名称，回车搜索"
        :allow-clear="true"
        @clear="searchResults = []"
        @enter="onSearchEnter"
      />
      <Btn type="primary" :loading="searchLoading" @click="onSearchEnter">搜索</Btn>
    </div>
    <div class="search-results chooser-list">
      <div v-if="searchLoading" class="chooser-empty">搜索中…</div>
      <div
        v-for="item in searchResults"
        :key="item.symbol"
        class="chooser-item"
        @click="selectedResultSymbol = item.symbol"
      >
        <div class="chooser-item-row">
          <div class="chooser-main">
            <span class="chooser-name">{{ item.name }}</span>
            <span class="chooser-code">{{ item.symbol }}</span>
          </div>
          <div class="chooser-meta">{{ item.type }}</div>
          <Btn
            v-if="selectedResultSymbol === item.symbol"
            size="small"
            type="primary"
            class="chooser-add"
            @click.stop="addStock(item)"
            >添加</Btn
          >
        </div>
      </div>
      <div v-if="!searchLoading && hasSearched && !searchResults.length" class="chooser-empty">
        没有找到相关标的
      </div>
    </div>
  </Modal>

  <Modal
    :show="showSettingsModal"
    @update:show="showSettingsModal = $event"
    title="设置"
    confirm-text="保存"
    :confirm-loading="settingsSaving"
    @confirm="saveSettings"
    @cancel="showSettingsModal = false"
  >
    <div class="settings-row">
      <span class="settings-label">图表宽度</span>
      <Input v-model="chartWidthInput" placeholder="60" @enter="saveSettings" />
      <span class="settings-unit">%</span>
    </div>
    <div class="settings-row settings-tags-row">
      <span class="settings-label">标签管理</span>
      <HorizontalScroll class="settings-tags-scroll">
        <template v-for="tag in settingsTags" :key="tag">
          <Btn size="small"
            >{{ tag }}
            <CircleBtn
              icon="close"
              :size="14"
              :font-size="10"
              :aria-label="`删除 ${tag}`"
              @click="removeTag(tag)"
            ></CircleBtn
          ></Btn>
        </template>
        <span v-if="!settingsTags.length" class="settings-tags-empty">暂无标签</span>
      </HorizontalScroll>
    </div>
    <div class="settings-row">
      <span class="settings-label">添加标签</span>
      <Input v-model="tagInput" placeholder="输入标签" @enter="addTag" />
      <Btn size="small" @click="addTag">确认</Btn>
    </div>
    <div class="settings-row settings-multi">
      <span class="settings-label">提示框位置</span>
      <Input v-model="tooltipXInput" placeholder="x" />
      <Input v-model="tooltipYInput" placeholder="y" />
    </div>
    <div class="settings-row settings-multi">
      <span class="settings-label">数据范围</span>
      <Input v-model="rangeDayInput" placeholder="日K" />
      <Input v-model="rangeWeekInput" placeholder="周K" />
      <Input v-model="rangeMonthInput" placeholder="月K" />
    </div>
  </Modal>
</template>

<style lang="less" scoped>
.sort-btns {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  & + .settings-row {
    margin-top: 0.625rem;
  }

  .settings-label {
    flex: 0 0 auto;
    font-size: 13px;
  }

  > :nth-child(2) {
    flex: 1 1 auto;
    min-width: 0;
  }

  .settings-unit {
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--text-secondary);
  }

  &.settings-multi {
    > *:not(.settings-label) {
      flex: 1 1 0;
      min-width: 0;
    }
  }

  &.settings-tags-row {
    align-items: center;

    .settings-tags-scroll {
      min-width: 0;
      padding-bottom: 2px;
    }

    .settings-tags-empty {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

.stock-empty {
  margin-top: 2rem;
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  > :first-child {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.search-results {
  max-height: 50vh;
  overflow-y: auto;

  // 与 Diet 搜索结果一致的 chooser 风格
  &.chooser-list {
    display: grid;
    gap: 0.4rem;
  }

  .chooser-item {
    padding: 0.55rem 0.65rem;
    border-radius: 0.7rem;
    background: var(--bg);
    cursor: pointer;
    text-align: left;

    &:hover {
      background: rgba(66, 185, 131, 0.12);
    }
  }

  .chooser-item-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .chooser-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.375rem;

    .chooser-name {
      font-size: 13px;
      font-weight: 600;
    }

    .chooser-code {
      font-size: 12px;
      color: var(--text-secondary);
    }
  }

  .chooser-meta {
    flex: 0 0 auto;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .chooser-add {
    flex: 0 0 auto;
  }

  .chooser-empty {
    margin-left: 1px;
    color: var(--text-secondary);
    font-size: 13px;
    text-align: left;
  }
}
</style>
