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
import { progressPercent, type ProgressMethod } from '../../utils/common'
import { useToastStore } from '../../store/toast'
import { useUserStore } from '../../store/user'
import type { ChartRange, MarketItem, MarketQuote, MarketSearchResult, StockComment } from 'shared/types/stock'

const toastStore = useToastStore()
const userStore = useUserStore()
const router = useRouter()

// settings 同步串行化：服务端每个请求都是读整个 settings 再写回，
// 并发请求会互相覆盖（比如删分组时 groups/watchlist 两个请求竞态，分组删了又回来）
let settingsSyncChain: Promise<unknown> = Promise.resolve()
const syncSettings = (settings: Record<string, any>) => {
  if (!userStore.isLogin) return
  settingsSyncChain = settingsSyncChain
    .then(() => userStore.updateSettings(settings))
    .catch(e => console.error('sync settings failed', e))
}

const WATCHLIST_KEY = 'klineWatchlist'
// 当前选中的 K 线范围（日K/周K/月K），卡片 tab 与添加弹窗的迷你图共用
const currentRange = ref<ChartRange>('1y')

// 同时只展开一张卡片（空串 = 全部折叠）
const expandedSymbol = ref('')

// bottom navbar（返回 + 分组 + 添加）；添加仅管理员可见
const navItems = computed(() => {
  const items = [
    { key: 'back', label: '‹ 返回' },
    { key: 'group', label: `${activeGroup.value || '默认分组'}` },
  ]
  if (userStore.isAdmin) items.push({ key: 'add', label: '添加' })
  return items
})
const onBottomNavSelect = (key: string) => {
  if (key === 'back') {
    router.go(-1)
    return
  }
  if (key === 'add') {
    openAddModal()
    return
  }
  if (key === 'group') {
    openGroupModal('enter')
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
  // 服务端按 symbol+name 过滤校验后合并进 settings.stock，失败不影响本地
  syncSettings({ stock: { watchlist: watchlist.value } })
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
    // 默认进 active 分组；无 active 时进默认分组（默认分组=无分组时则不分组）
    group:
      activeGroup.value != null
        ? activeGroup.value || undefined
        : defaultGroup.value || undefined,
  })
  saveWatchlist()
  showAddModal.value = false
  toastStore.showToast({ content: `已添加 ${item.name}`, type: 'OK' })
}

// 分组：存 user.settings.stock.groups（与 watchlist 同样的 localStorage 兜底 + 服务端同步）
// activeGroup：null=全部不过滤，''=无分组，其它=对应分组
const GROUPS_KEY = 'klineGroups'
const groups = ref<string[]>([])
// 进入页面默认选中默认分组；手动切换过后不再跟随默认分组变化
const groupTouched = ref(false)
const activeGroup = ref<string | null>(null)

const loadGroups = () => {
  try {
    const saved = localStorage.getItem(GROUPS_KEY)
    const parsed = saved ? JSON.parse(saved) : []
    groups.value = Array.isArray(parsed) ? parsed.filter((g: unknown) => typeof g === 'string') : []
  } catch {
    groups.value = []
  }
}
const saveGroups = () => {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value))
  syncSettings({ stock: { groups: groups.value } })
}
loadGroups()
watch(
  () => userStore.userInfo.settings.stock?.groups,
  serverGroups => {
    if (!userStore.isLogin || !Array.isArray(serverGroups)) return
    if (serverGroups.length) {
      groups.value = serverGroups.filter((g): g is string => typeof g === 'string')
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups.value))
    } else if (groups.value.length) {
      saveGroups()
    }
  }
)

// 分组弹窗：assign=修改某只股票的分组（管理模式的☰），enter=进入分组（navbar）
// activeGroup：null=全部不过滤，''=无分组（伪分组，不可删除），其它=对应分组
const showGroupModal = ref(false)
const groupModalMode = ref<'assign' | 'enter'>('enter')
const groupAssignSymbol = ref('')
const newGroupInput = ref('')

// 默认分组（存 user.settings.stock.defaultGroup，空=无分组）
const defaultGroup = computed(() => userStore.userInfo.settings.stock?.defaultGroup ?? '')
// 进入页面选中默认分组；用户手动切换后不再跟随
watch(
  defaultGroup,
  g => {
    if (!groupTouched.value) activeGroup.value = g
  },
  { immediate: true }
)

const openGroupModal = (mode: 'assign' | 'enter', symbol = '') => {
  groupModalMode.value = mode
  groupAssignSymbol.value = symbol
  newGroupInput.value = ''
  showGroupModal.value = true
}

const addGroup = () => {
  const name = newGroupInput.value.trim()
  if (!name) {
    toastStore.showToast({ content: '分组名不能为空', type: '!' })
    return
  }
  if (groups.value.includes(name)) {
    toastStore.showToast({ content: '分组已存在', type: '!' })
    return
  }
  groups.value.push(name)
  newGroupInput.value = ''
  saveGroups()
}

const pickGroup = (name: string) => {
  if (groupModalMode.value === 'assign') {
    const item = watchlist.value.find(it => it.symbol === groupAssignSymbol.value)
    if (item) {
      // 空串=无分组，清掉 group 字段
      item.group = name || undefined
      saveWatchlist()
    }
    showGroupModal.value = false
  } else {
    groupTouched.value = true
    activeGroup.value = name
    showGroupModal.value = false
  }
}

const setDefaultGroup = (name: string) => {
  if (defaultGroup.value === name) return
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能保存设置', type: '!' })
    return
  }
  syncSettings({ stock: { defaultGroup: name } })
}

const removeGroup = (name: string) => {
  if (!confirm(`确定删除分组「${name}」吗？分组内的标的会被清空。`)) return
  groups.value = groups.value.filter(g => g !== name)
  // 清空该分组里的标的（移出分组，标的本身保留）
  watchlist.value.forEach(it => {
    if (it.group === name) it.group = undefined
  })
  if (activeGroup.value === name) {
    groupTouched.value = true
    activeGroup.value = null
  }
  saveGroups()
  saveWatchlist()
  // 被删的是默认分组则重置为无分组
  if (defaultGroup.value === name) syncSettings({ stock: { defaultGroup: '' } })
}

const removeStock = (symbol: string) => {
  watchlist.value = watchlist.value.filter(it => it.symbol !== symbol)
  saveWatchlist()
}

// 列表排序：涨跌幅（实时报价）/ 进度（最新评论的完成百分比，无进度排最后）；
// 点击当前排序切换正倒序，默认降序（↓），无数据的一律排最后
type SortKey = 'change' | 'progress'
const sortKey = ref<SortKey>('change')
const sortAsc = ref(false)
const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'change', label: '涨跌幅' },
  { key: 'progress', label: '进度' },
]
const onSortClick = (key: SortKey) => {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = false
  }
}

// header 显示模式：评价=tag+进度，基本面=价格+市盈+市值，管理=修改分组+删除（仅管理员）
type HeaderMode = 'eval' | 'fundamental' | 'manage'
const headerMode = ref<HeaderMode>('eval')
const headerModeOptions = computed<{ key: HeaderMode; label: string }[]>(() => {
  const options = [
    { key: 'eval' as HeaderMode, label: '评价' },
    { key: 'fundamental' as HeaderMode, label: '基本面' },
  ]
  if (userStore.isAdmin) options.push({ key: 'manage' as HeaderMode, label: '管理' })
  return options
})
// 权限降级时退出管理模式（管理入口只对管理员渲染，这里是兜底）
watch(
  () => userStore.isAdmin,
  isAdmin => {
    if (!isAdmin && headerMode.value === 'manage') headerMode.value = 'eval'
  },
)

// 进度计算方式选项（设置弹窗按钮组，默认对数）
const progressMethodOptions: { key: ProgressMethod; label: string }[] = [
  { key: 'linear', label: '跌幅' },
  { key: 'ln', label: '对数' },
  { key: 'sigmoid', label: 'S型' },
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

// 进度排序需要每个标的的最新评论（comments 按时间倒序，取第一条）
const latestComments = ref<Record<string, StockComment | null>>({})
const loadLatestComments = async () => {
  const symbols = watchlist.value.map(it => it.symbol)
  if (!symbols.length) {
    latestComments.value = {}
    return
  }
  const entries = await Promise.all(
    symbols.map(async symbol => {
      try {
        const list: StockComment[] = await request(
          `market/comments?symbol=${encodeURIComponent(symbol)}`
        )
        return [symbol, list[0] ?? null] as const
      } catch (e) {
        return [symbol, null] as const
      }
    })
  )
  latestComments.value = Object.fromEntries(entries)
}
// 最新评论的完成百分比：目标价、当时价、现价齐全才算得出，否则视为无进度。
// 计算方式来自设置（跌幅/对数/S 型），默认对数
const progressMethod = computed<ProgressMethod>(() => {
  const m = userStore.userInfo.settings.stock?.progressMethod
  return m === 'linear' || m === 'sigmoid' ? m : 'ln'
})
const progressOf = (symbol: string): number | null => {
  const comment = latestComments.value[symbol]
  const current = quoteOf(symbol)?.price
  if (!comment || comment.targetPrice == null || comment.currentPrice == null || current == null) {
    return null
  }
  return progressPercent(current, comment.currentPrice, comment.targetPrice, progressMethod.value)
}
watch(sortKey, key => {
  if (key === 'progress') loadLatestComments()
})
watch(
  () => watchlist.value.map(it => it.symbol).join(','),
  () => {
    if (sortKey.value === 'progress') loadLatestComments()
  }
)

const sortedWatchlist = computed(() => {
  // 先按 active 分组过滤：null=全部，''=只要无分组的
  const filtered =
    activeGroup.value === null
      ? watchlist.value
      : watchlist.value.filter(it => (it.group ?? '') === activeGroup.value)
  const dir = sortAsc.value ? 1 : -1
  const valueOf = (symbol: string): number | null =>
    sortKey.value === 'change' ? (quoteOf(symbol)?.changePercent ?? null) : progressOf(symbol)
  return [...filtered].sort((a, b) => {
    const va = valueOf(a.symbol)
    const vb = valueOf(b.symbol)
    // 无数据的一律排最后，正序倒序都一样
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return (va - vb) * dir
  })
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

// settings：图表高度 / 标签管理 / K线提示框位置（存 user.settings.stock）
const showSettingsModal = ref(false)
const chartHeightInput = ref('80')
const settingsTags = ref<string[]>([])
const tagInput = ref('')
const tooltipXInput = ref('20')
const tooltipYInput = ref('20')
const progressMethodInput = ref<ProgressMethod>('ln')
const yMinInput = ref<'low' | 'zero'>('zero')
const yMinOptions: { key: 'low' | 'zero'; label: string }[] = [
  { key: 'low', label: '最低点' },
  { key: 'zero', label: '0点' },
]
const rangeDayInput = ref('60')
const rangeWeekInput = ref('52')
const rangeMonthInput = ref('120')
const settingsSaving = ref(false)
const DEFAULT_TAGS = ['看涨', '看跌', '长期', '短期']
const DEFAULT_DATA_RANGE = { day: 60, week: 52, month: 120 }
const currentChartHeight = computed(() => {
  const h = Number(userStore.userInfo.settings.stock?.chartHeight)
  return Number.isFinite(h) && h >= 40 && h <= 300 ? h : 80
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
  chartHeightInput.value = String(currentChartHeight.value)
  const savedTags = userStore.userInfo.settings.stock?.tags
  settingsTags.value = savedTags?.length ? [...savedTags] : [...DEFAULT_TAGS]
  tagInput.value = ''
  tooltipXInput.value = String(currentTooltipOffset.value.x)
  tooltipYInput.value = String(currentTooltipOffset.value.y)
  progressMethodInput.value = progressMethod.value
  yMinInput.value = userStore.userInfo.settings.stock?.yMin === 'low' ? 'low' : 'zero'
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
  const h = Number(chartHeightInput.value)
  if (!Number.isFinite(h) || h < 40 || h > 300) {
    toastStore.showToast({ content: '请输入 40~300 之间的数值', type: '!' })
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
    // 走串行队列，避免和分组/watchlist 的同步请求并发覆盖
    await new Promise<void>((resolve, reject) => {
      settingsSyncChain = settingsSyncChain
        .then(async () => {
          await userStore.updateSettings({
            stock: {
              chartHeight: Math.round(h),
              progressMethod: progressMethodInput.value,
              yMin: yMinInput.value,
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
          resolve()
        })
        .catch(e => {
          reject(e)
        })
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
              @click="onSortClick(opt.key)"
              >{{ opt.label
              }}<span v-if="sortKey === opt.key" class="sort-arrow">{{
                sortAsc ? '↑' : '↓'
              }}</span></Btn
            >
          </div>
          <span class="nav-divider"></span>
          <div class="sort-btns">
            <Btn
              v-for="opt in headerModeOptions"
              :key="opt.key"
              size="small"
              :type="headerMode === opt.key ? 'primary' : undefined"
              @click="headerMode = opt.key"
              >{{ opt.label }}</Btn
            >
          </div>
        </template>
        <template #right>
          <Btn v-if="userStore.isAdmin" size="small" @click="openSettingsModal">设置</Btn>
        </template>
      </PageHeader>
      <StockCard
        v-for="item in sortedWatchlist"
        :key="item.symbol"
        :symbol="item.symbol"
        :name="item.name"
        v-model:range="currentRange"
        :expanded="expandedSymbol === item.symbol"
        :header-mode="headerMode"
        @update:expanded="value => (expandedSymbol = value ? item.symbol : '')"
        @change-group="openGroupModal('assign', item.symbol)"
        @remove="removeStock(item.symbol)"
      />
      <div v-if="!watchlist.length" class="stock-empty">
        {{ userStore.isAdmin ? '还没有添加标的，点下方「添加」开始吧～' : '暂无标的' }}
      </div>
      <BottomNavBar :items="navItems" @select="onBottomNavSelect" />
    </template>
  </List>

  <Modal
    :show="showAddModal"
    @update:show="showAddModal = $event"
    :placement="'bottom'"
    :padding-bottom="true"
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
    <!-- 未搜索时不渲染结果容器，避免空 div 产生 gap -->
    <div v-if="hasSearched || searchLoading" class="search-results chooser-list">
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
      <span class="settings-label">图表高度</span>
      <Input v-model="chartHeightInput" placeholder="80" @enter="saveSettings" />
      <span class="settings-unit">px</span>
    </div>
    <div class="settings-row settings-multi">
      <span class="settings-label">提示框位置</span>
      <Input v-model="tooltipXInput" placeholder="x" />
      <Input v-model="tooltipYInput" placeholder="y" />
    </div>
    <div class="settings-row">
      <span class="settings-label">最低点</span>
      <div class="settings-methods">
        <Btn
          v-for="opt in yMinOptions"
          :key="opt.key"
          size="small"
          :type="yMinInput === opt.key ? 'primary' : undefined"
          @click="yMinInput = opt.key"
          >{{ opt.label }}</Btn
        >
      </div>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row settings-multi">
      <span class="settings-label">数据范围</span>
      <Input v-model="rangeDayInput" placeholder="日K" />
      <Input v-model="rangeWeekInput" placeholder="周K" />
      <Input v-model="rangeMonthInput" placeholder="月K" />
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row">
      <span class="settings-label">进度计算</span>
      <div class="settings-methods">
        <Btn
          v-for="opt in progressMethodOptions"
          :key="opt.key"
          size="small"
          :type="progressMethodInput === opt.key ? 'primary' : undefined"
          @click="progressMethodInput = opt.key"
          >{{ opt.label }}</Btn
        >
      </div>
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
  </Modal>

  <Modal
    :show="showGroupModal"
    @update:show="showGroupModal = $event"
    :title="groupModalMode === 'assign' ? '修改分组' : '进入分组'"
    placement="bottom"
    :hide-footer="true"
  >
    <div v-if="userStore.isAdmin" class="group-add-row">
      <Input v-model="newGroupInput" placeholder="输入分组名" @enter="addGroup" />
      <Btn @click="addGroup">创建</Btn>
    </div>
    <div class="group-list chooser-list">
      <!-- 默认分组：伪分组，不可删除，存的就是 group 为空的标的 -->
      <div class="chooser-item" @click="pickGroup('')">
        <div class="chooser-item-row">
          <div class="chooser-main">
            <span class="chooser-name">默认分组</span>
          </div>
          <Btn
            v-if="headerMode === 'manage'"
            size="small"
            :type="defaultGroup === '' ? 'primary' : undefined"
            @click.stop="setDefaultGroup('')"
            >默认</Btn
          >
        </div>
      </div>
      <div v-for="name in groups" :key="name" class="chooser-item" @click="pickGroup(name)">
        <div class="chooser-item-row">
          <div class="chooser-main">
            <span class="chooser-name">{{ name }}</span>
          </div>
          <Btn
            v-if="headerMode === 'manage'"
            size="small"
            :type="defaultGroup === name ? 'primary' : undefined"
            @click.stop="setDefaultGroup(name)"
            >默认</Btn
          >
          <CircleBtn
            v-if="headerMode === 'manage'"
            icon="close"
            :size="16"
            :font-size="10"
            :aria-label="`删除 ${name}`"
            @click.stop="removeGroup(name)"
          ></CircleBtn>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style lang="less" scoped>
.sort-btns {
  display: flex;
  align-items: center;
  gap: 0.375rem;

  // ↑↓ 通常命中与中文不同的字体，基线略低，上移对齐
  .sort-arrow {
    vertical-align: 1px;
  }
}

.nav-divider {
  flex: 0 0 auto;
  width: 1px;
  background: var(--border-light);
  height: 14px;
}

.settings-methods {
  display: flex;
  gap: 0.375rem;
}

.settings-divider {
  height: 1px;
  margin: 0.25rem 0;
  background: var(--border-light);
}

// 分组弹窗
.group-add-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  > :first-child {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.group-list {
  max-height: 40vh;
  overflow-y: auto;

  .group-empty {
    padding: 0.75rem 0.25rem;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

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
}

// 与 Diet 搜索结果一致的 chooser 风格（搜索列表和分组列表共用）
.chooser-list {
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
</style>
