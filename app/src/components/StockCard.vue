<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Card from './Card.vue'
import Btn from './Btn.vue'
import CircleBtn from './CircleBtn.vue'
import Modal from './Modal.vue'
import Textarea from './Textarea.vue'
import KlineChart from './KlineChart.vue'
import { request } from '../utils/request'
import { formatDate } from '../utils/common'
import { useToastStore } from '../store/toast'
import { useUserStore } from '../store/user'
import type { ChartRange, MarketChartResult, StockComment } from 'shared/types/stock'

const props = defineProps<{
  symbol: string
  name: string
  range: ChartRange
}>()
const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'update:range', range: ChartRange): void
}>()

const toastStore = useToastStore()
const userStore = useUserStore()

const rangeLabels: Record<ChartRange, string> = {
  '3mo': '日K',
  '1y': '周K',
  '10y': '月K',
}

// 进入视口才加载数据（卡片很多时避免首屏批量请求）
const cardEl = ref<HTMLElement | null>(null)
const activated = ref(false)
let observer: IntersectionObserver | null = null

// charts
const charts = ref<Record<ChartRange, MarketChartResult | null>>({
  '3mo': null,
  '1y': null,
  '10y': null,
})
const chartLoading = ref<Record<ChartRange, boolean>>({
  '3mo': false,
  '1y': false,
  '10y': false,
})
const currentTab = computed({
  get: () => props.range,
  set: (range: ChartRange) => emit('update:range', range),
})

const loadChart = async (range: ChartRange) => {
  if (charts.value[range] || chartLoading.value[range]) return
  chartLoading.value[range] = true
  try {
    charts.value[range] = await request(
      `market/chart?symbol=${encodeURIComponent(props.symbol)}&range=${range}`
    )
  } catch (e) {
    console.error(e)
  }
  chartLoading.value[range] = false
}

const activate = () => {
  if (activated.value) return
  activated.value = true
  loadChart(props.range)
  loadComments()
}

const currentChart = computed(() => charts.value[currentTab.value])

// 顶栏报价：优先用接口带的实时报价（qt），否则退回周K最后收盘
const quote = computed(() => currentChart.value?.quote)
const lastPrice = computed(() => quote.value?.price ?? null)
const changePercent = computed(() => quote.value?.changePercent ?? null)
const priceUp = computed(() => (changePercent.value ?? 0) >= 0)
const pe = computed(() => quote.value?.pe ?? null)
const isTrading = computed(() => quote.value?.marketStatus === '交易中')
const marketCap = computed(() => {
  const cap = quote.value?.marketCap
  if (cap == null) return null
  return cap >= 10000 ? `${(cap / 10000).toFixed(2)}万亿` : `${cap.toFixed(0)}亿`
})

const switchTab = (range: ChartRange) => {
  currentTab.value = range
  loadChart(range)
}

// 点击名称在名称/代码之间切换
const showCode = ref(false)

// comments
const comments = ref<StockComment[]>([])
const showCommentModal = ref(false)
const commentInput = ref('')
const commentLoading = ref(false)

// 只展示最新一条评论（列表按时间倒序，第一个即最新），纯文本无卡片
const latestComment = computed(() => comments.value[0] ?? null)

// 第二行：最新评论的标签
const latestTags = computed(() => latestComment.value?.tags ?? [])

const loadComments = async () => {
  try {
    comments.value = await request(`market/comments?symbol=${encodeURIComponent(props.symbol)}`)
  } catch (e) {
    console.error(e)
  }
}

const openCommentModal = () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能评论', type: '!' })
    return
  }
  editingCommentId.value = null
  commentInput.value = ''
  selectedTags.value = []
  showCommentModal.value = true
}

// 浏览评论弹窗：点击卡片上的评论打开，可左右切换历史评论
const showBrowseModal = ref(false)
const browseIndex = ref(0)
// comments 按时间倒序，0 为最新
const browseComment = computed(() => comments.value[browseIndex.value] ?? null)
const canBrowseNewer = computed(() => browseIndex.value > 0)
const canBrowseOlder = computed(() => browseIndex.value < comments.value.length - 1)

const openBrowseModal = () => {
  if (!latestComment.value) return
  browseIndex.value = 0
  showBrowseModal.value = true
}
const browseNewer = () => {
  if (canBrowseNewer.value) browseIndex.value--
}
const browseOlder = () => {
  if (canBrowseOlder.value) browseIndex.value++
}

// 编辑评论（复用添加弹窗，标题区分；更新不影响显示时间）
const editingCommentId = ref<string | null>(null)
const commentModalTitle = computed(() => (editingCommentId.value ? '编辑评论' : '添加评论'))

const openEditComment = () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能编辑', type: '!' })
    return
  }
  const comment = browseComment.value
  if (!comment?._id) return
  editingCommentId.value = comment._id
  commentInput.value = comment.content
  selectedTags.value = [...(comment.tags ?? [])]
  showBrowseModal.value = false
  showCommentModal.value = true
}

const deleteBrowseComment = async () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能删除', type: '!' })
    return
  }
  const comment = browseComment.value
  if (!comment?._id) return
  if (!confirm('确定删除这条评论吗？')) return
  try {
    await request(`market/comments/${comment._id}`, 'delete')
    comments.value.splice(browseIndex.value, 1)
    if (browseIndex.value > comments.value.length - 1) {
      browseIndex.value = Math.max(0, comments.value.length - 1)
    }
    if (!comments.value.length) showBrowseModal.value = false
    toastStore.showToast({ content: '已删除', type: 'OK' })
  } catch (e) {
    toastStore.showToast({ content: '删除失败', type: 'ERR' })
  }
}

// tags：固定几个标签，可勾选一个或多个
const FIXED_TAGS = ['看涨', '看跌', '长期', '短期']
const selectedTags = ref<string[]>([])
const toggleTag = (tag: string) => {
  const index = selectedTags.value.indexOf(tag)
  if (index >= 0) {
    selectedTags.value.splice(index, 1)
  } else {
    selectedTags.value.push(tag)
  }
}

const submitComment = async () => {
  const content = commentInput.value.trim()
  if (!content) {
    toastStore.showToast({ content: '评论内容不能为空', type: '!' })
    return
  }
  commentLoading.value = true
  try {
    if (editingCommentId.value) {
      const updated: StockComment = await request(
        `market/comments/${editingCommentId.value}`,
        'patch',
        { content, tags: selectedTags.value }
      )
      // 只更新内容与标签，created_time 不变，顺序不变
      const index = comments.value.findIndex(c => c._id === editingCommentId.value)
      if (index >= 0) comments.value[index] = updated
      toastStore.showToast({ content: '已更新', type: 'OK' })
    } else {
      const comment: StockComment = await request('market/comments', 'POST', {
        symbol: props.symbol,
        content,
        tags: selectedTags.value,
      })
      comments.value.unshift(comment)
      toastStore.showToast({ content: '评论成功', type: 'OK' })
    }
    editingCommentId.value = null
    showCommentModal.value = false
  } catch (e) {
    toastStore.showToast({ content: '操作失败', type: 'ERR' })
  }
  commentLoading.value = false
}

const remove = () => {
  if (confirm(`确定移除 ${props.name}（${props.symbol}）吗？`)) {
    emit('remove')
  }
}

// 图表宽度（来自 user.settings.stock，由页面顶栏的设置弹窗维护，默认 60%）
const chartWidth = computed(() => {
  const w = Number(userStore.userInfo.settings.stock?.chartWidth)
  return Number.isFinite(w) && w >= 10 && w <= 90 ? w : 60
})

onMounted(() => {
  // 进入视口（提前 100px）才触发首次加载
  if (cardEl.value) {
    observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer?.disconnect()
          observer = null
          activate()
        }
      },
      { rootMargin: '100px' }
    )
    observer.observe(cardEl.value)
  } else {
    activate()
  }
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <Card :ref="(el: any) => (cardEl = el?.$el ?? el)" class="stock-card">
    <div class="stock-header">
      <span class="stock-name" :title="showCode ? name : symbol" @click="showCode = !showCode">{{
        showCode ? symbol : name
      }}</span>
      <span class="stock-price" v-if="lastPrice != null">{{ lastPrice.toFixed(2) }}</span>
      <span
        v-if="changePercent != null"
        class="stock-change"
        :class="{ up: priceUp, down: !priceUp }"
        >{{ priceUp ? '+' : '' }}{{ changePercent.toFixed(2) }}%</span
      >
      <span v-if="pe != null" class="stock-meta">{{ pe.toFixed(2) }}</span>
      <span v-if="marketCap" class="stock-meta">{{ marketCap }}</span>
      <span v-if="isTrading" class="trading-badge">交易中</span>
      <CircleBtn
        class="stock-delete"
        icon="close"
        :size="16"
        :font-size="12"
        @click="remove"
      ></CircleBtn>
    </div>
    <div class="stock-tags-row">
      <div class="latest-tags">
        <span v-for="tag in latestTags" :key="tag" class="comment-badge">{{ tag }}</span>
      </div>
      <Btn size="small" class="tags-row-btn" @click="openCommentModal">评论</Btn>
    </div>
    <div class="stock-body">
      <div class="stock-chart" :style="{ width: chartWidth + '%' }">
        <div class="chart-area">
          <KlineChart :chart="currentChart" :loading="chartLoading[currentTab]" />
        </div>
        <div class="chart-tabs">
          <span
            v-for="(label, range) in rangeLabels"
            :key="range"
            class="chart-tab"
            :class="{ active: currentTab === range }"
            @click="switchTab(range as ChartRange)"
            >{{ label }}</span
          >
        </div>
      </div>
      <div class="stock-comments" :class="{ clickable: !!latestComment }" @click="openBrowseModal">
        <template v-if="latestComment">
          <div class="comment-time">{{ formatDate(String(latestComment.created_time)) }}</div>
          <div class="comment-text">{{ latestComment.content }}</div>
        </template>
        <div v-else class="comment-empty">暂无评论</div>
      </div>
    </div>

    <Modal
      :show="showCommentModal"
      @update:show="showCommentModal = $event"
      :title="commentModalTitle"
      confirm-text="发送"
      :confirm-loading="commentLoading"
      @confirm="submitComment"
      @cancel="
        () => {
          showCommentModal = false
          editingCommentId = null
        }
      "
    >
      <Textarea v-model="commentInput" :rows="10" placeholder="输入评论内容" />
      <div class="tag-picker">
        <span
          v-for="tag in FIXED_TAGS"
          :key="tag"
          class="tag-option"
          :class="{ active: selectedTags.includes(tag) }"
          @click="toggleTag(tag)"
          >{{ tag }}</span
        >
      </div>
    </Modal>

    <Modal
      :show="showBrowseModal"
      @update:show="showBrowseModal = $event"
      title="评论"
      :hide-footer="true"
    >
      <div class="browse-nav">
        <CircleBtn
          icon="chevron-left"
          :size="20"
          :font-size="12"
          :class="{ disabled: !canBrowseOlder }"
          aria-label="上一条"
          @click="browseOlder"
        ></CircleBtn>
        <span class="browse-counter">
          {{ comments.length ? `${comments.length - browseIndex}/${comments.length}` : '0/0' }}
        </span>
        <CircleBtn
          icon="chevron-right"
          :size="20"
          :font-size="12"
          :class="{ disabled: !canBrowseNewer }"
          aria-label="下一条"
          @click="browseNewer"
        ></CircleBtn>
      </div>
      <template v-if="browseComment">
        <div class="browse-time">{{ formatDate(String(browseComment.created_time)) }}</div>
        <div class="browse-content">{{ browseComment.content }}</div>
      </template>
      <div class="browse-actions">
        <Btn size="small" @click="openEditComment">编辑</Btn>
        <Btn size="small" @click="deleteBrowseComment">删除</Btn>
      </div>
    </Modal>
  </Card>
</template>

<style lang="less" scoped>
.stock-card {
  text-align: left;
  padding: 0.5rem 0.75rem;
}

.stock-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem 0.5rem;

  .stock-name {
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
  }

  .stock-price {
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
  }

  .stock-change {
    font-size: 12px;
    font-weight: bold;

    &.up {
      color: #ef5350;
    }

    &.down {
      color: #26a69a;
    }
  }

  .stock-meta {
    font-size: 12px;
    color: var(--text-secondary);
  }

  .trading-badge {
    font-size: 11px;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    color: #fff;
    background: var(--primary-color);
  }

  .stock-delete {
    margin-left: auto;
    font-size: 12px;
    color: #aaa;
    cursor: pointer;

    &:hover {
      color: var(--danger-color, #ef5350);
    }
  }
}

.stock-body {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.stock-chart {
  flex: 0 0 auto;
  min-width: 0;

  .chart-area {
    position: relative;
    height: 80px;
  }

  .chart-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;

    .chart-tab {
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      height: 16px;

      &.active {
        color: #fff;
        background: var(--primary-color);
      }
    }
  }
}

.stock-tags-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.375rem;

  .latest-tags {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tags-row-btn {
    flex: 0 0 auto;
  }

  .comment-badge {
    font-size: 11px;
    padding: 0 0.375rem;
    border-radius: 999px;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    background: var(--bg);
  }
}

.stock-comments {
  flex: 1 1 auto;
  min-width: 0;
  max-height: 104px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 12px;
  line-height: 1.4;

  .comment-text {
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    line-clamp: 5;
    overflow: hidden;
  }

  .comment-time {
    flex: 0 0 auto;
    font-size: 11px;
    color: #aaa;
  }

  .comment-empty {
    color: var(--text-secondary);
  }

  &.clickable {
    cursor: pointer;
  }
}

// 浏览评论弹窗
.browse-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;

  .disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .browse-counter {
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 3rem;
    text-align: center;
  }
}

.browse-time {
  font-size: 11px;
  color: #aaa;
  margin-bottom: 0.25rem;
}

.browse-content {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  height: 300px;
  overflow-y: auto;
}

.browse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.tag-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;

  .tag-option {
    font-size: 12px;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    cursor: pointer;
    user-select: none;

    &.active {
      color: #fff;
      background: var(--primary-color);
      border-color: var(--primary-color);
    }
  }
}
</style>
