<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import List from '@/components/layout/List.vue'
import Card from '@/components/Card.vue'
import Input from '@/components/Input.vue'
import Textarea from '@/components/Textarea.vue'
import Btn from '@/components/Btn.vue'
import AiStream from '@/components/AiStream.vue'
import { request } from '@/utils/request'
import { ip } from '@/config'
import type { DictionaryRecord, DictionaryWordAnalysis } from 'shared/types/dictionary'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import Modal from '@/components/Modal.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useToastStore } from '@/store/toast'
import { useUserStore } from '@/store/user'
import { storeToRefs } from 'pinia'

const toastStore = useToastStore()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const route = useRoute()
const router = useRouter()

const word = ref('')
const searchWord = ref('')
const result = ref<DictionaryWordAnalysis | null>(null)
const displayRoot = computed(() => result.value?.rootAnalysis?.root?.trim().replace(/^-+|-+$/g, '').toLowerCase() || '')
const streamText = ref('')
const streamModelId = ref('')
const streamStatus = ref<'connecting' | 'streaming'>('connecting')
const analysisError = ref('')
const recent = ref<Partial<DictionaryRecord>[]>([])
const searchResults = ref<Partial<DictionaryRecord>[]>([])

type CategoryNode = {
  label: string
  count: number
  words: { word: string; wordLower: string }[]
  children: CategoryNode[]
}
const categoryTree = ref<CategoryNode[]>([])
const categoryWordCount = ref(0)
/** 当前选中的分类链（每层一个 label），第 N 列展示链上第 N-1 个分类的子内容 */
const selectedCategoryPath = ref<string[]>([])
const categoryColumnsRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const searchLoading = ref(false)
const currentTab = ref<'action' | 'list'>('list')
const showSearchPanel = ref(false)
const searchTimer = ref<number | null>(null)

const canSearch = computed(() => !!searchWord.value.trim() && !loading.value)
const canDelete = computed(() => !!word.value.trim() && !loading.value)
const pageMode = computed<'home' | 'word'>(() => {
  if (route.name === 'dictionaryWord') return 'word'
  return 'home'
})

type CategoryColumn = {
  categories: CategoryNode[]
  words: { word: string; wordLower: string }[]
}

/** 类 Finder 列视图：第 1 列是顶层分类，选中后追加下一列（分类在前、词汇在后） */
const categoryColumns = computed<CategoryColumn[]>(() => {
  const columns: CategoryColumn[] = [{ categories: categoryTree.value, words: [] }]
  let level = categoryTree.value
  for (const label of selectedCategoryPath.value) {
    const node = level.find((item) => item.label === label)
    if (!node) break
    columns.push({ categories: node.children, words: node.words })
    level = node.children
  }
  return columns
})

const selectCategory = (columnIndex: number, label: string) => {
  selectedCategoryPath.value = [...selectedCategoryPath.value.slice(0, columnIndex), label]
  nextTick(() => {
    const el = categoryColumnsRef.value
    if (el) el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: 'smooth' })
  })
}

// 非管理员只读：只能浏览分类与已有词详情
const isAdmin = computed(() => Number(userInfo.value?.role) === 3)

const navItems = computed(() => {
  const items: Array<{ key: string; label: string; active?: boolean }> = [{ key: 'back', label: '‹ 返回' }]
  if (isAdmin.value) {
    items.push({ key: 'action', label: '查询', active: currentTab.value === 'action' })
  }
  items.push({ key: 'list', label: '词库', active: pageMode.value === 'home' })
  return items
})

const loadRecent = async () => {
  const res = await request('dictionary/recent', 'get', { limit: 12 }, { withCredentials: false })
  recent.value = Array.isArray(res?.items) ? res.items : []
}

const loadSearchPanel = async (keyword = '') => {
  searchLoading.value = true
  try {
    const res = await request(
      'dictionary/search',
      'get',
      { q: keyword, limit: keyword ? 20 : 5 },
      { withCredentials: false }
    )
    searchResults.value = Array.isArray(res?.items) ? res.items : []
  } finally {
    searchLoading.value = false
  }
}

const loadCategoryGroups = async () => {
  const res = await request('dictionary/categories', 'get', undefined, { withCredentials: false })
  categoryTree.value = Array.isArray(res?.items) ? res.items : []
  categoryWordCount.value = Number(res?.wordCount) || 0
}

const learningWords = ref<{ word: string }[]>([])
const learningTotal = ref(0)
const learningInput = ref('')
const learningAdding = ref(false)
const selectedLearningWord = ref('')

const toggleLearningWord = (word: string) => {
  selectedLearningWord.value = selectedLearningWord.value === word ? '' : word
}

const loadLearningWords = async () => {
  const res = await request('dictionary/learning', 'get', { limit: 100 }, { withCredentials: false })
  learningWords.value = Array.isArray(res?.items) ? res.items : []
  learningTotal.value = Number(res?.total) || 0
}

const addLearningWords = async () => {
  const text = learningInput.value.trim()
  if (!text || learningAdding.value) return
  learningAdding.value = true
  try {
    const res = await request('dictionary/learning/add', 'post', { text }, { withCredentials: false })
    learningInput.value = ''
    toastStore.showToast({
      content: `新增 ${res?.addedCount || 0} 个待学词（共 ${res?.total || 0}）`,
      type: 'OK',
    })
    await loadLearningWords()
  } catch (err: any) {
    toastStore.showToast({
      content: err?.response?.data?.message || err?.message || '添加失败，请稍后重试',
      type: 'ERR',
    })
  } finally {
    learningAdding.value = false
  }
}

const ignoreLearningWord = async (word: string) => {
  if (!word || loading.value) return
  try {
    await request('dictionary/learning/delete', 'post', { word }, { withCredentials: false })
    learningWords.value = learningWords.value.filter((item) => item.word !== word)
    learningTotal.value = Math.max(0, learningTotal.value - 1)
    if (selectedLearningWord.value === word) selectedLearningWord.value = ''
  } catch (err: any) {
    toastStore.showToast({
      content: err?.response?.data?.message || err?.message || '删除失败，请稍后重试',
      type: 'ERR',
    })
  }
}

const scheduleSearch = (keyword: string) => {
  if (searchTimer.value) {
    window.clearTimeout(searchTimer.value)
  }
  searchTimer.value = window.setTimeout(() => {
    void loadSearchPanel(keyword)
  }, 180)
}

const analyze = async (targetWord?: string, isRegenerate = false, navigate = true, allowRedirect = true) => {
  const q = `${targetWord || searchWord.value}`.trim()
  if (!q || loading.value) return

  loading.value = true
  word.value = q
  result.value = null
  streamText.value = ''
  streamModelId.value = ''
  streamStatus.value = 'connecting'
  analysisError.value = ''

  try {
    if (navigate) {
      await router.push({ name: 'dictionaryWord', params: { word: q } })
    }
    showSearchPanel.value = false
    const response = await fetch(new URL('/api/dictionary/analyze', ip), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: q, isRegenerate }),
    })
    if (!response.ok || !response.body) throw new Error(`查询失败 (${response.status})`)

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let completed = false
    const readEvent = (event: string) => {
      const data = event.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
      if (!data) return
      const chunk = JSON.parse(data) as { status?: string; content?: string; text?: string; modelId?: string; error?: string; errorType?: 'network' | 'api' }
      if (chunk.modelId) streamModelId.value = chunk.modelId
      if (chunk.status === 'connecting' || chunk.status === 'streaming') streamStatus.value = chunk.status
      if (chunk.error) {
        const error = new Error(chunk.error) as Error & { errorType?: 'network' | 'api' }
        error.errorType = chunk.errorType
        throw error
      }
      if (chunk.content !== undefined && chunk.status !== 'done') streamText.value = chunk.content
      if (chunk.text) streamText.value += chunk.text
      if (chunk.status === 'done' && chunk.content !== undefined) content = chunk.content
      if (chunk.status === 'done') completed = true
    }
    while (true) {
      const { value, done } = await reader.read()
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, '\n')
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''
      for (const event of events) readEvent(event)
      if (done) break
    }
    if (buffer.trim()) readEvent(buffer)
    if (!completed) throw new Error('查询中断，请重新查询以继续接收')

    result.value = JSON.parse(content) as DictionaryWordAnalysis
    word.value = q

    // 变形词/拼写纠错：模型判定后改为查询原形或纠错词（只重定向一层，避免循环）
    const redirectWord = (
      result.value.isWordValid
        ? `${result.value.word || ''}`
        : `${result.value.correctedWord || ''}`
    ).trim().toLowerCase()
    if (allowRedirect && isAdmin.value && redirectWord && redirectWord !== q.toLowerCase()) {
      if (!result.value.isWordValid) {
        toastStore.showToast({
          content: `未找到 "${q}"，已自动查询相近词 "${redirectWord}"`,
          type: '?',
        })
      }
      loading.value = false // 递归调用内部的 loading 守卫需要放行
      await analyze(redirectWord, false, true, false)
      // 重定向成功后清掉变形/错拼的词条，避免分类树出现重复或拼错的词
      if (result.value && `${result.value.word || ''}`.toLowerCase() === redirectWord) {
        try {
          await request('dictionary/delete', 'post', { word: q }, { withCredentials: false })
          await Promise.allSettled([loadCategoryGroups(), loadRecent()])
        } catch {
          // 清理失败不影响主流程
        }
      }
      return
    }

    await Promise.allSettled([loadRecent(), loadSearchPanel(word.value), loadCategoryGroups()])
    showSearchPanel.value = false
    currentTab.value = 'list'
  } catch (err: any) {
    if (err?.errorType === 'network') {
      analysisError.value = `网络连接失败：${err?.message || '无法连接 AI 服务'}，请检查网络后重试`
    } else {
      analysisError.value = err?.response?.data?.message || err?.message || '查询失败，请稍后重试'
    }
    toastStore.showToast({
      content: analysisError.value,
      type: 'ERR',
    })
    await Promise.allSettled([loadRecent(), loadSearchPanel(word.value), loadCategoryGroups()])
  } finally {
    loading.value = false
  }
}

const requery = async () => {
  const q = `${word.value || ''}`.trim()
  if (!q || loading.value) return

  const confirmed = window.confirm(`确认重新查询单词 ${q} 吗？`) 
  if (!confirmed) return

  await analyze(q, true)
}

const removeWord = async () => {
  const q = `${word.value || ''}`.trim()
  if (!q || loading.value) return

  const confirmed = window.confirm(`确认删除单词 ${q} 吗？`)
  if (!confirmed) return

  loading.value = true
  try {
    const res = await request('dictionary/delete', 'post', { word: q }, { withCredentials: false })
    result.value = null
    analysisError.value = ''
    word.value = ''
    searchWord.value = ''
    currentTab.value = 'list'
    showSearchPanel.value = false
    await router.push({ name: 'dictionary' })

    await loadRecent()
    await loadSearchPanel('')
    await loadCategoryGroups()

    toastStore.showToast({
      content: `删除成功（${res?.deletedCount || 0} 条）`,
      type: 'OK',
    })
  } catch (err: any) {
    toastStore.showToast({
      content: err?.response?.data?.message || err?.message || '删除失败，请稍后重试',
      type: 'ERR',
    })
  } finally {
    loading.value = false
  }
}

const closeSearchPanel = () => {
  showSearchPanel.value = false
  if (currentTab.value === 'action') {
    currentTab.value = 'list'
  }
}

const handleSelectNav = (key: string) => {
  if (key === 'back') {
    router.push({ name: 'playground' })
    return
  }
  if (key === 'action') {
    currentTab.value = 'action'
    showSearchPanel.value = true
    return
  }
  if (key === 'list') {
    currentTab.value = 'list'
    showSearchPanel.value = false
    void router.push({ name: 'dictionary' })
  }
}

const goWord = (targetWord: string) => {
  if (!targetWord) return
  void analyze(targetWord, false, true)
}

/** 从词页跳到分类树的对应位置：选中链截到被点击的那一层 */
const goCategory = async (path: string[], index: number) => {
  selectedCategoryPath.value = path.slice(0, index + 1)
  currentTab.value = 'list'
  showSearchPanel.value = false
  // 必须等路由切换、首页卡片渲染完成后，列容器才存在，才能滚动定位
  await router.push({ name: 'dictionary' })
  await nextTick()
  const el = categoryColumnsRef.value
  if (el) el.scrollTo({ left: el.scrollWidth - el.clientWidth, behavior: 'smooth' })
}

const handleSearchEnter = (event: KeyboardEvent) => {
  const nativeEvent = event as KeyboardEvent & { keyCode?: number }
  if (nativeEvent.isComposing || nativeEvent.keyCode === 229) return
  event.preventDefault()
  void analyze(searchWord.value)
}

const syncByRoute = async () => {
  if (pageMode.value === 'word') {
    currentTab.value = 'list'
    showSearchPanel.value = false
    const routeWord = `${route.params.word || ''}`.trim()
    const loadedWord = `${word.value || ''}`.trim()
    if (result.value && loadedWord && loadedWord.toLowerCase() === routeWord.toLowerCase()) {
      return
    }
    await analyze(routeWord, false, false)
    return
  }

  result.value = null
  analysisError.value = ''
  word.value = ''
  if (pageMode.value === 'home' || pageMode.value === 'root') {
    currentTab.value = 'list'
    showSearchPanel.value = false
  }
}

watch(
  () => searchWord.value,
  value => {
    scheduleSearch(`${value || ''}`.trim())
  }
)

watch(
  () => route.fullPath,
  () => {
    void syncByRoute()
  },
)

onMounted(() => {
  void loadRecent()
  void loadSearchPanel('')
  void loadCategoryGroups()
  void loadLearningWords()
  void syncByRoute()
})
</script>

<template>
  <List>
    <template #content>
      <PageHeader>
        <template #right>
          <Btn v-if="pageMode === 'word' && word && !loading && isAdmin" small @click="requery"
            >重新查询</Btn
          >
          <Btn v-if="pageMode === 'word' && word && isAdmin" :disabled="!canDelete" small type="danger" @click="removeWord"
            >删除</Btn
          >
        </template>
      </PageHeader>
      <Card v-if="pageMode === 'home'">
        <template #title>分类<span class="learning-total">（{{ categoryWordCount }}）</span></template>
        <div v-if="categoryTree.length" ref="categoryColumnsRef" class="category-columns">
          <div
            v-for="(column, columnIndex) in categoryColumns"
            :key="columnIndex"
            class="category-column"
          >
            <div
              v-for="node in column.categories"
              :key="node.label"
              class="category-row"
              :class="{ selected: selectedCategoryPath[columnIndex] === node.label }"
              @click="selectCategory(columnIndex, node.label)"
            >
              <span class="label">{{ node.label }}</span>
              <span class="row-right">
                <span class="count">{{ node.count }}</span>
                <span class="chevron">▸</span>
              </span>
            </div>
            <div
              v-for="w in column.words"
              :key="w.wordLower"
              class="category-row word"
              @click="goWord(w.word)"
            >
              <span class="label">{{ w.word }}</span>
            </div>
          </div>
        </div>
        <div v-else class="category-empty">no result</div>
        <div v-if="selectedCategoryPath.length" class="category-breadcrumb">
          <template v-for="(label, index) in selectedCategoryPath" :key="`${label}-${index}`">
            <span class="link" @click="selectCategory(index, label)">{{ label }}</span>
            <span v-if="index < selectedCategoryPath.length - 1" class="classification-sep">/</span>
          </template>
        </div>
      </Card>

      <Card v-if="pageMode === 'home' && isAdmin">
        <template #title>待学词<span class="learning-total">（{{ learningTotal }}）</span></template>
        <div class="learning-list">
          <div v-if="!learningWords.length" class="category-empty">no result</div>
          <div
            v-for="item in learningWords"
            :key="item.word"
            class="learning-row"
            :class="{ selected: selectedLearningWord === item.word }"
            @click="toggleLearningWord(item.word)"
          >
            <span class="word-label">{{ item.word }}</span>
            <div v-if="selectedLearningWord === item.word" class="actions" @click.stop>
              <Btn small @click="goWord(item.word)">查词</Btn>
              <Btn small type="danger" @click="ignoreLearningWord(item.word)">忽略</Btn>
            </div>
          </div>
        </div>
        <div class="search-row learning-add">
          <Textarea
            v-model="learningInput"
            class="learning-textarea"
            small
            :rows="2"
            placeholder="粘贴句子或单词列表，自动提取英文单词（已查过的词自动跳过）"
          />
          <Btn :loading="learningAdding" @click="addLearningWords">添加</Btn>
        </div>
      </Card>

      <AiStream v-if="pageMode === 'word' && loading && !result" :text="streamText" :model-id="streamModelId" :status="streamStatus" />
      <div v-if="pageMode === 'word' && !loading && analysisError" class="analysis-error" role="alert">
        <div class="word">{{ word }}</div>
        <div class="error-title">查询失败</div>
        <div class="error-message">{{ analysisError }}</div>
      </div>
      <div class="display" v-if="pageMode === 'word' && result">
        <div class="word">{{ result.word }}</div>
        <Card>
          <div class="text">{{ displayRoot }}</div>
          <div class="secondary-text">{{ result.rootAnalysis.rootMeaning }}</div>
          <div class="secondary-text">{{ result.rootAnalysis.etymologyStory }}</div>
          <div class="">
            <div v-for="(item, index) in result.rootAnalysis.cognates" :key="`${item.word}-${index}`" class="text">
              {{ item.word }} - {{ item.explanation }}
            </div>
          </div>
        </Card>

        <Card>
          <div v-for="meaning in result.meanings" :key="meaning.partOfSpeech" class="section">
            <div class="sub-title">{{ meaning.partOfSpeech }}</div>
            <div v-for="(def, index) in meaning.definitions" :key="index" class="sub-section">
              <div class="text">{{ def.meaning }}</div>
              <div v-if="def.classification?.length" class="secondary-text classification-line">
                分类:
                <template v-for="(label, index) in def.classification" :key="`${label}-${index}`">
                  <span class="link" @click="goCategory(def.classification, index)">{{ label }}</span>
                  <span v-if="index < def.classification.length - 1" class="classification-sep">/</span>
                </template>
              </div>
              <div class="secondary-text">{{ def.example }}</div>
              <div class="secondary-text">{{ def.exampleTranslation }}</div>
              <div
                v-for="(syn, synIndex) in def.synonymsAnalysis"
                :key="`${syn.term}-${synIndex}`"
                class="secondary-text"
              >
                <span class="bold">{{ syn.term }}</span> ({{ syn.usageShare }}%) - {{ syn.usageContext }}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>
  </List>
  <Modal
    :show="showSearchPanel"
    @update:show="closeSearchPanel"
    :hideFooter="true"
    :placement="'bottom'"
    :blur-backdrop="false"
  >
    <div class="search-results">
      <div class="empty-text" v-if="(searchWord.length ? searchResults : recent).length === 0">no result</div>
      <div
        v-for="item in searchWord.length ? searchResults : recent"
        :key="item._id || item.word"
        class="item"
        @click="analyze(item.word)"
      >
        <span>{{ item.word }}</span>
      </div>
    </div>
    <div class="search-row">
      <Input v-model="searchWord" small @keydown.enter="handleSearchEnter" />
      <Btn :disabled="!canSearch" :loading="loading" @click="analyze(searchWord)">查询</Btn>
    </div>
  </Modal>
  <BottomNavBar :items="navItems" @select="handleSelectNav" />
</template>

<style lang="less" scoped>
.search-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: nowrap;

  & > :first-child {
    flex: 1 1 auto;
  }
}

// 类 Finder 的多列分类浏览：每层一列，横向滑动
.category-columns {
  display: flex;
  overflow-x: auto;
  gap: 0.25rem;
  text-align: left;
  -webkit-overflow-scrolling: touch;

  .category-column {
    flex: 0 0 auto;
    width: 7.25rem;
    max-height: 24rem;
    overflow-y: auto;
    padding: 0.15rem;
    border-radius: 8px;
    background: var(--bg);
  }

  .category-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.25rem;
    padding: 0.35rem 0.45rem;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text);
    font-size: 13px;
    line-height: 18px;
    transition: 0.15s ease;

    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row-right {
      display: flex;
      align-items: center;
      gap: 0.2rem;
      flex: 0 0 auto;
    }

    .count {
      color: var(--text-secondary);
      font-size: 11px;
    }

    .chevron {
      color: var(--text-secondary);
      font-size: 10px;
    }

    &.word {
      color: var(--text-secondary);
      font-size: 12px;

      &:hover {
        color: var(--primary-color);
      }
    }

    &.selected {
      background: var(--primary-color);
      color: #fff;

      .count,
      .chevron {
        color: rgba(255, 255, 255, 0.85);
      }
    }
  }
}

.category-empty {
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary);
}

// 待学词卡片
.learning-total {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: normal;
}

.learning-list {
  // 约 5.5 行的高度（行高 29px + 行距 4.8px），第 6 行露一半提示可滚动
  max-height: 11.25rem;
  overflow-y: auto;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;

  .learning-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
    transition: 0.15s ease;

    &.selected {
      background: var(--btn-hover);
    }

    .word-label {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex: 0 0 auto;
    }
  }
}

.learning-add {
  margin-top: 0.6rem;

  .learning-textarea {
    flex: 1 1 auto;
    min-height: 3rem;
    max-height: 10rem;
  }
}

.category-breadcrumb {
  margin-top: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-light);
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary);
  overflow-wrap: anywhere;

  .classification-sep {
    margin: 0 0.25rem;
  }
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  .empty-text {
    text-align: left;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .item {
    width: calc(100% - 1.3rem);
    padding: 0.5rem 0.65rem;
    // border: 1px solid var(--border-light);
    border-radius: 8px;
    background: var(--bg);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: .2s ease;
  }
}

.analysis-error {
  padding: 0.75rem 0;
  min-width: 0;

  .word {
    font-size: 1.75rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .error-title {
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .error-message {
    color: var(--text-secondary);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.875rem;
    line-height: 1.6;
  }
}

.display {
  .word {
    font-size: 1.75rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .section {
    margin: 0 0 1rem 0;
    &:last-child {
      margin-bottom: 0;
    }
  }
  .sub-section {
    margin: 0 0 0.5rem 0;
    &:last-child {
      margin-bottom: 0;
    }
  }
  .text {
    text-align: left;
    font-size: 14px;
    line-height: 20px;
    margin: 0 1px 0.25rem 1px;
    &:last-child {
      margin-bottom: 0;
    }
  }
  .sub-title {
    font-weight: bold;
    text-align: left;
    margin: 0 1px 0.25rem 1px;
    &:last-child {
      margin-bottom: 0;
    }
  }
  .secondary-text {
    text-align: left;
    font-size: 12px;
    line-height: 16px;
    margin: 0rem 1px 0.25rem 1px;
    color: var(--text-secondary);
    &:last-child {
      margin-bottom: 0;
    }
  }
  .bold {
    font-weight: bold;
  }

  .classification-line {
    .classification-sep {
      margin: 0 0.25rem;
    }
  }

  .cognates-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
}

.recent-word {
  font-weight: 600;
}

.section-title {
  margin-top: 0.35rem;
  margin-bottom: 0.35rem;
  font-weight: 600;
}

.root-text {
  line-height: 1.65;
  margin: 0;
}

.cognate-chip {
  padding: 0.2rem 0.52rem;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border-light);
  background: rgba(148, 163, 184, 0.08);
}

.meaning-block + .meaning-block {
  margin-top: 0.8rem;
}

.pos {
  font-weight: 600;
  margin-bottom: 0.4rem;
}

.def-item + .def-item {
  margin-top: 0.6rem;
}

.def-item {
  padding: 0.52rem 0.64rem;
  border-radius: 8px;
  border: 1px solid var(--border-light);
  background: rgba(148, 163, 184, 0.06);
}

.example {
  margin-top: 0.2rem;
  color: var(--text-secondary);
}

.translation {
  margin-top: 0.2rem;
}

.syn-item + .syn-item {
  margin-top: 0.75rem;
}

.syn-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.tag {
  font-size: 12px;
  padding: 0.1rem 0.35rem;
  border-radius: 999px;
  border: 1px solid var(--border-light);
}

.tag.rare {
  color: #b42318;
  border-color: #fecdca;
  background: #fffbfa;
}

.tag.normal {
  color: #0369a1;
  border-color: #bae6fd;
  background: #f0f9ff;
}

.usage {
  margin-top: 0.2rem;
}

.note {
  margin-top: 0.2rem;
  color: var(--text-secondary);
}

.muted {
  color: var(--text-secondary);
}
</style>
