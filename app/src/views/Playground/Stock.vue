<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import List from '../../components/layout/List.vue'
import PageHeader from '../../components/layout/PageHeader.vue'
import Btn from '../../components/Btn.vue'
import Modal from '../../components/Modal.vue'
import Input from '../../components/Input.vue'
import StockCard from '../../components/StockCard.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { request } from '../../utils/request'
import { useToastStore } from '../../store/toast'
import { useUserStore } from '../../store/user'
import type {
  ChartRange,
  MarketItem,
  MarketSearchResult,
} from 'shared/types/stock'

const toastStore = useToastStore()
const userStore = useUserStore()
const router = useRouter()

const WATCHLIST_KEY = 'klineWatchlist'

// 当前选中的 K 线范围（日K/周K/月K），卡片 tab 与添加弹窗的迷你图共用
const currentRange = ref<ChartRange>('1y')

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

// watchlist
const watchlist = ref<MarketItem[]>([])
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
}

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
    searchResults.value = await request(
      `market/search?q=${encodeURIComponent(query.trim())}`
    )
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

// settings：图表宽度（存 user.settings.stock，默认 60%）
const showSettingsModal = ref(false)
const chartWidthInput = ref('60')
const settingsSaving = ref(false)
const currentChartWidth = computed(() => {
  const w = Number(userStore.userInfo.settings.stock?.chartWidth)
  return Number.isFinite(w) && w >= 10 && w <= 90 ? w : 60
})

const openSettingsModal = () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能保存设置', type: '!' })
    return
  }
  chartWidthInput.value = String(currentChartWidth.value)
  showSettingsModal.value = true
}

const saveSettings = async () => {
  const w = Number(chartWidthInput.value)
  if (!Number.isFinite(w) || w < 10 || w > 90) {
    toastStore.showToast({ content: '请输入 10~90 之间的数值', type: '!' })
    return
  }
  settingsSaving.value = true
  try {
    await userStore.updateSettings({ stock: { chartWidth: Math.round(w) } })
    showSettingsModal.value = false
    toastStore.showToast({ content: '设置已保存', type: 'OK' })
  } catch (e) {
    toastStore.showToast({ content: '设置保存失败', type: 'ERR' })
  }
  settingsSaving.value = false
}

loadWatchlist()
</script>

<template>
  <List>
    <template v-slot:content>
      <PageHeader>
        <template #left>
          <span class="stock-title">我来画K线</span>
        </template>
        <template #right>
          <Btn size="small" @click="openSettingsModal">设置</Btn>
        </template>
      </PageHeader>
      <StockCard
        v-for="item in watchlist"
        :key="item.symbol"
        :symbol="item.symbol"
        :name="item.name"
        v-model:range="currentRange"
        @remove="removeStock(item.symbol)"
      />
      <div v-if="!watchlist.length" class="stock-empty">
        还没有添加标的，点下方「添加」开始吧～
      </div>
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
      <Btn
        type="primary"
        :loading="searchLoading"
        @click="onSearchEnter"
        >搜索</Btn
      >
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
      <div
        v-if="!searchLoading && hasSearched && !searchResults.length"
        class="chooser-empty"
      >
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
  </Modal>
</template>

<style lang="less" scoped>
.stock-title {
  font-size: 16px;
  font-weight: 700;
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
