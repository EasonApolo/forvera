<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import Card from './Card.vue'
import Btn from './Btn.vue'
import CircleBtn from './CircleBtn.vue'
import Modal from './Modal.vue'
import Input from './Input.vue'
import Textarea from './Textarea.vue'
import KlineChart from './KlineChart.vue'
import { request } from '../utils/request'
import { formatDate, progressPercent, type ProgressMethod } from '../utils/common'
import { useToastStore } from '../store/toast'
import { useUserStore } from '../store/user'
import type { ChartRange, MarketChartResult, StockComment } from 'shared/types/stock'

const props = defineProps<{
  symbol: string
  name: string
  range: ChartRange
  expanded: boolean
  /** header 显示模式：评价=tag+进度，基本面=价格+市盈+市值，管理=修改分组+删除 */
  headerMode?: 'eval' | 'fundamental' | 'manage'
}>()
const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'update:range', range: ChartRange): void
  (e: 'update:expanded', expanded: boolean): void
  (e: 'change-group'): void
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

// K 线数据条数（日K/周K/月K，设置里可改，默认 60/52/120）
const dataRangeCounts = computed<Record<ChartRange, number>>(() => {
  const dr = userStore.userInfo.settings.stock?.dataRange
  const pick = (v: number | undefined, def: number) =>
    Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : def
  return {
    '3mo': pick(dr?.day, 60),
    '1y': pick(dr?.week, 52),
    '10y': pick(dr?.month, 120),
  }
})

const loadChart = async (range: ChartRange) => {
  if (charts.value[range] || chartLoading.value[range]) return
  chartLoading.value[range] = true
  try {
    charts.value[range] = await request(
      `market/chart?symbol=${encodeURIComponent(props.symbol)}&range=${range}` +
        `&count=${dataRangeCounts.value[range]}`
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

// 顶栏报价：优先用当前 tab 图表带的实时报价；range 是全部卡片共用的，
// 别的卡片切 tab 会导致本卡片当前 tab 无数据，此时退回任意已加载图表的报价
// （任一图表接口内嵌的 qt 都是同一个实时行情）
const quote = computed(() => {
  if (currentChart.value?.quote) return currentChart.value.quote
  for (const c of Object.values(charts.value)) {
    if (c?.quote) return c.quote
  }
  return undefined
})
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

// K 线竖线选中的日期（评论时间用），由 KlineChart 同步过来
const selectedTradeDate = ref('')

// 评论日期缺省用当前图表最后一根K线的日期（最后一个交易日），
// 避免图表未加载完时提交把非交易日（如周末）当成评论日期
const defaultCommentDate = computed(() => {
  const chart = currentChart.value
  const n = chart?.timestamps.length ?? 0
  if (!chart || !n) return ''
  return formatDate(new Date(chart.timestamps[n - 1]).toISOString()).slice(0, 10)
})

// 指定日期在当前图表里的收盘价（评论的「当时价格」）：找到第一根 ≥ 该日期的K线取收盘；
// 月K 按整月匹配。找不到（图表未加载/超范围）返回 null
const priceAtDate = (dateStr: string): number | null => {
  const chart = currentChart.value
  if (!chart || !dateStr) return null
  const n = chart.timestamps.length
  if (!n) return null
  const interval =
    chart.interval || (chart.range === '10y' ? 'month' : chart.range === '3mo' ? 'day' : 'week')
  const keyOf = (d: string) => (interval === 'month' ? d.slice(0, 7) : d)
  const target = keyOf(dateStr)
  const pad2 = (v: number) => String(v).padStart(2, '0')
  for (let i = 0; i < n; i++) {
    const ts = chart.timestamps[i]
    if (ts == null) continue
    const d = new Date(ts)
    const ds = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    if (keyOf(ds) >= target) return chart.closes[i] ?? null
  }
  return null
}

// 评论时间只显示日期（created_time 已被服务端规范为某个交易日的零点）
const commentDate = (comment: StockComment) =>
  formatDate(String(comment.created_time)).slice(0, 10)

// 右侧展示的评论：时间轴分区间的取法 —— 选中时间落在 (X, Y] 显示 Y（第一个 ≥ 选中时间的评论），
// 比如有时间顺序 A<B<C 三个评论：(0,A]→A、(A,B]→B、(B,C]→C、(C,现在)→C（保持上一个）。
// 在按评论时间升序的副本上查找，避免插入顺序影响结果
const displayedComment = computed(() => {
  const sorted = [...comments.value].sort(
    (a, b) => new Date(a.created_time).getTime() - new Date(b.created_time).getTime(),
  )
  const selected = selectedTradeDate.value
  if (!selected) return sorted[sorted.length - 1] ?? null
  const keyOf = (d: string) => (props.range === '10y' ? d.slice(0, 7) : d)
  const selectedKey = keyOf(selected)
  return (
    sorted.find(c => keyOf(commentDate(c)) >= selectedKey) ??
    sorted[sorted.length - 1] ??
    null
  )
})
// K 线图上的评论标记：日期 + 期望价格 + 评论时的价格
const commentMarks = computed(() =>
  comments.value.map(c => ({
    date: commentDate(c),
    targetPrice: c.targetPrice ?? null,
    currentPrice: c.currentPrice ?? null,
  }))
)

// 进度计算方式（设置里可切换，默认对数）
const progressMethod = computed<ProgressMethod>(() => {
  const m = userStore.userInfo.settings.stock?.progressMethod
  return m === 'linear' || m === 'sigmoid' ? m : 'ln'
})

// 评论价格信息一行：目标、当前（弹窗打开时定格）、起始（评论时价格）、进度（整数无小数点）；
// 无目标价则只显示起始
const completionText = (comment: StockComment | null | undefined): string | null => {
  if (!comment) return null
  const then = comment.currentPrice
  if (then == null) return null
  const parts: string[] = []
  if (comment.targetPrice != null) parts.push(`目标 ${comment.targetPrice}`)
  const cur = modalPriceSnapshot.value
  if (cur != null) parts.push(`当前 ${cur.toFixed(2)}`)
  parts.push(`起始 ${then}`)
  if (comment.targetPrice != null && cur != null) {
    const percent = progressPercent(cur, then, comment.targetPrice, progressMethod.value)
    if (percent != null) parts.push(`进度 ${percent.toFixed(1)}%`)
  }
  return parts.join(' · ')
}
// header 的 tag 和完成百分比固定按最新评论，不随 K 线选中日期变化
const headerCompletion = computed(() => {
  const comment = comments.value[0]
  const cur = lastPrice.value
  if (!comment || comment.targetPrice == null || comment.currentPrice == null || cur == null) {
    return null
  }
  return progressPercent(cur, comment.currentPrice, comment.targetPrice, progressMethod.value)
})

// 折叠态：expanded 由父组件统一管理，同时只展开一张卡片
// 展开时确保当前 tab 的 K 线数据已拉取（切过 range 的其它卡片展开会补请求）
watch(
  () => props.expanded,
  value => {
    if (!value) return
    if (!activated.value) {
      activate()
      return
    }
    if (!charts.value[currentTab.value]) loadChart(currentTab.value)
  },
)

// comments
const comments = ref<StockComment[]>([])
const showCommentModal = ref(false)
const commentInput = ref('')
const targetPriceInput = ref('')
const commentLoading = ref(false)

// 解析期望价格：空或非正数视为无
const parseTargetPrice = (): number | null => {
  const raw = targetPriceInput.value.trim()
  if (!raw) return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

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
  editingCommentDate.value = ''
  commentInput.value = ''
  targetPriceInput.value = ''
  selectedTags.value = []
  showCommentModal.value = true
}

// 浏览评论弹窗里的“当前价格”：打开弹窗时定格实时价，不随后续行情刷新
const modalPriceSnapshot = ref<number | null>(null)

// 浏览评论弹窗：点击卡片上的评论打开，可左右切换历史评论
const showBrowseModal = ref(false)
const browseIndex = ref(0)
// comments 按时间倒序，0 为最新
const browseComment = computed(() => comments.value[browseIndex.value] ?? null)
const canBrowseNewer = computed(() => browseIndex.value > 0)
const canBrowseOlder = computed(() => browseIndex.value < comments.value.length - 1)

const openBrowseModal = () => {
  if (!displayedComment.value) return
  // 打开时定位到卡片上正在显示的那条评论，而不是永远最新一条
  const index = comments.value.indexOf(displayedComment.value)
  browseIndex.value = index >= 0 ? index : 0
  modalPriceSnapshot.value = lastPrice.value
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
// 编辑中的评论原日期（添加模式为空，展示选中K线日期）
const editingCommentDate = ref('')
const commentModalTitle = computed(() => (editingCommentId.value ? '编辑评论' : '添加评论'))
// 弹窗里展示的评论日期：编辑用原日期，添加用 K 线选中日期（缺省最后一个交易日）
const commentModalDate = computed(
  () => editingCommentDate.value || selectedTradeDate.value || defaultCommentDate.value
)

// 评论的「当时价格」：编辑用该评论已存的价格；添加用选中日期的收盘价（拿不到退回现价）
const modalThenPrice = computed(() => {
  if (editingCommentId.value) {
    return comments.value.find(c => c._id === editingCommentId.value)?.currentPrice ?? null
  }
  return priceAtDate(commentModalDate.value) ?? lastPrice.value
})

const openEditComment = () => {
  if (!userStore.isLogin) {
    toastStore.showToast({ content: '登录后才能编辑', type: '!' })
    return
  }
  const comment = browseComment.value
  if (!comment?._id) return
  editingCommentId.value = comment._id
  editingCommentDate.value = commentDate(comment)
  commentInput.value = comment.content
  targetPriceInput.value = comment.targetPrice != null ? String(comment.targetPrice) : ''
  // 已在设置里删除的 tag 视为遗失，只选中仍然存在的
  selectedTags.value = (comment.tags ?? []).filter(t => availableTags.value.includes(t))
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

// tags：候选标签来自用户设置（设置里可管理），默认四个；编辑时已被设置删除的 tag 视为遗失，不再选中
const DEFAULT_TAGS = ['看涨', '看跌', '长期', '短期']
const availableTags = computed(() => {
  const tags = userStore.userInfo.settings.stock?.tags
  return tags?.length ? tags : DEFAULT_TAGS
})
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
  const targetPrice = parseTargetPrice()
  try {
    if (editingCommentId.value) {
      const updated: StockComment = await request(
        `market/comments/${editingCommentId.value}`,
        'patch',
        { content, tags: selectedTags.value, targetPrice }
      )
      // 只更新内容、标签和期望价格，created_time 不变，顺序不变
      const index = comments.value.findIndex(c => c._id === editingCommentId.value)
      if (index >= 0) comments.value[index] = updated
      toastStore.showToast({ content: '已更新', type: 'OK' })
    } else {
      const comment: StockComment = await request('market/comments', 'POST', {
        symbol: props.symbol,
        content,
        tags: selectedTags.value,
        date: selectedTradeDate.value || defaultCommentDate.value || undefined,
        targetPrice,
        // 当时价格 = 评论日期的收盘价（不再是提交时的实时价）
        currentPrice: modalThenPrice.value ?? undefined,
      })
      // 按评论时间（倒序）插入到正确位置：评论日期可能是历史日期，直接 unshift 会打乱时间序
      const createdTime = new Date(comment.created_time).getTime()
      const insertAt = comments.value.findIndex(
        c => new Date(c.created_time).getTime() < createdTime
      )
      if (insertAt < 0) comments.value.push(comment)
      else comments.value.splice(insertAt, 0, comment)
      toastStore.showToast({ content: '评论成功', type: 'OK' })
    }
    editingCommentId.value = null
    editingCommentDate.value = ''
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

// 图表宽度不再可配：K 线与评论始终平分，无评论时 K 线占满

// K 线图高度（设置里可改，默认 80px）
const chartHeight = computed(() => {
  const h = Number(userStore.userInfo.settings.stock?.chartHeight)
  return Number.isFinite(h) && h >= 40 && h <= 300 ? h : 80
})

// K 线提示框相对指针的偏移（设置里可改，默认 20,20）
const tooltipOffset = computed(() => ({
  x: Number(userStore.userInfo.settings.stock?.tooltipOffset?.x) || 20,
  y: Number(userStore.userInfo.settings.stock?.tooltipOffset?.y) || 20,
}))

// K 线纵轴最低点（设置里可改，默认 0 点）
const yMin = computed(() => (userStore.userInfo.settings.stock?.yMin === 'low' ? 'low' : 'zero'))

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
    <div class="stock-header" @click="emit('update:expanded', !props.expanded)">
      <span class="trading-dot" :class="{ active: isTrading }"></span>
      <span class="stock-name">{{ name }}</span>
      <span
        v-if="changePercent != null"
        class="stock-change"
        :class="{ up: priceUp, down: !priceUp }"
        >{{ priceUp ? '+' : '' }}{{ changePercent.toFixed(2) }}%</span
      >
      <template v-if="(headerMode ?? 'eval') === 'eval'">
        <Btn
          v-for="tag in comments[0]?.tags ?? []"
          :key="tag"
          small
          >{{ tag }}</Btn
        >
        <span v-if="headerCompletion != null" class="stock-completion"
          >{{ headerCompletion.toFixed(0) }}%</span
        >
      </template>
      <template v-else-if="(headerMode ?? 'eval') === 'fundamental'">
        <span class="stock-price" v-if="lastPrice != null">{{ lastPrice.toFixed(2) }}</span>
        <span v-if="pe != null" class="stock-meta">{{ pe.toFixed(2) }}</span>
        <span v-if="marketCap" class="stock-meta">{{ marketCap }}</span>
      </template>
      <CircleBtn
        v-if="headerMode === 'manage'"
        class="stock-group-btn"
        icon="menu"
        :size="16"
        :font-size="12"
        aria-label="修改分组"
        @click.stop="emit('change-group')"
      ></CircleBtn>
      <CircleBtn
        v-if="headerMode === 'manage'"
        class="stock-delete"
        icon="close"
        :size="16"
        :font-size="12"
        @click.stop="remove"
      ></CircleBtn>
    </div>
    <template v-if="expanded">
    <div class="stock-body">
      <div class="stock-chart">
        <div class="chart-area" :style="{ height: chartHeight + 'px' }">
          <KlineChart
            :chart="currentChart"
            :loading="chartLoading[currentTab]"
            :comment-marks="commentMarks"
            :active-date="displayedComment ? commentDate(displayedComment) : undefined"
            :tooltip-offset="tooltipOffset"
            :y-min="yMin"
            @update:selected-date="selectedTradeDate = $event"
          />
        </div>
      </div>
      <div v-if="displayedComment" class="stock-comments clickable" @click="openBrowseModal">
        <div :style="{ height: chartHeight + 'px' }">
          <div class="comment-time">{{ commentDate(displayedComment) }}</div>
          <div class="comment-text">{{ displayedComment.content }}</div>
        </div>
      </div>
    </div>
    <div class="stock-footer">
      <div class="chart-tabs">
        <Btn
          v-for="(label, range) in rangeLabels"
          :key="range"
          small
          class="chart-tab"
          :type="currentTab === range ? 'primary' : undefined"
          :class="{ active: currentTab === range }"
          @click="switchTab(range as ChartRange)"
          >{{ label }}</Btn
        >
      </div>
      <Btn v-if="userStore.isAdmin" size="small" class="comment-add-btn" @click="openCommentModal"
        >评论</Btn
      >
    </div>
    </template>

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
          editingCommentDate = ''
        }
      "
    >
      <div v-if="commentModalDate" class="comment-modal-date">日期：{{ commentModalDate }}</div>
      <Textarea v-model="commentInput" :rows="10" placeholder="输入评论内容" />
      <div class="target-price-row">
        <span class="target-price-label">期望价格</span>
        <Input v-model="targetPriceInput" placeholder="选填，画在 K 线图上" />
        <span v-if="modalThenPrice != null" class="snapshot-price"
          >当时 {{ modalThenPrice.toFixed(2) }}</span
        >
      </div>
      <div class="tag-picker">
        <Btn
          v-for="tag in availableTags"
          :key="tag"
          small
          :type="selectedTags.includes(tag) ? 'primary' : undefined"
          @click="toggleTag(tag)"
          >{{ tag }}</Btn
        >
      </div>
    </Modal>

    <Modal
      :show="showBrowseModal"
      @update:show="showBrowseModal = $event"
      title="评论"
      :hide-footer="true"
    >
      <template v-if="browseComment">
        <div class="browse-time">{{ commentDate(browseComment) }}</div>
        <div class="browse-content">{{ browseComment.content }}</div>
        <div v-if="completionText(browseComment)" class="browse-completion">
          {{ completionText(browseComment) }}
        </div>
        <div class="browse-tags">
          <Btn
            v-for="tag in browseComment.tags"
            :key="tag"
            small
            :type="selectedTags.includes(tag) ? 'primary' : undefined"
          >
            {{ tag }}
          </Btn>
        </div>
      </template>
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
      <div v-if="userStore.isAdmin" class="browse-actions">
        <Btn size="small" @click="openEditComment">编辑</Btn>
        <Btn size="small" @click="deleteBrowseComment">删除</Btn>
      </div>
    </Modal>
  </Card>
</template>

<style lang="less" scoped>
.stock-card {
  text-align: left;
  padding: 0.375rem 0.5rem;
}

.stock-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.25rem;

  .stock-name {
    font-size: 12px;
    font-weight: bold;
  }

  .stock-price {
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
  }

  .stock-completion {
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

  .trading-dot {
    flex: 0 0 auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #c4c4c4;
    align-self: center;

    &.active {
      background: var(--primary-color);
    }
  }

  // 管理模式下 ☰ 和删除按钮靠右并排，大小一致
  .stock-group-btn {
    margin-left: auto;
  }

  .stock-delete {
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

// 最后一行：日K/周K/月K 靠左，评论靠右
.stock-footer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;

  .comment-add-btn {
    margin-left: auto;
  }
}

.chart-tabs {
  display: flex;
  gap: 0.5rem;
}

.stock-chart {
  flex: 1 1 0;
  min-width: 0;

  .chart-area {
    position: relative;
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
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  font-size: 12px;
  line-height: 1.4;

  .comment-preview {
    flex: 0 0 auto;
  }

  .comment-text {
    word-break: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
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
}

.browse-content {
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  height: 160px;
  overflow-y: auto;
}

.browse-completion {
  margin-top: 0.375rem;
  font-size: 12px;
  color: var(--text-secondary);
}

.browse-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.comment-modal-date {
  margin-bottom: 0.375rem;
  font-size: 12px;
  color: var(--text-secondary);
}

.target-price-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .target-price-label {
    flex: 0 0 auto;
    font-size: 13px;
  }

  .snapshot-price {
    flex: 0 0 auto;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  > :nth-child(2) {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.tag-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
}
</style>
