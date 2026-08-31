<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import List from '@/components/layout/List.vue'
import Card from '@/components/Card.vue'
import Input from '@/components/Input.vue'
import Btn from '@/components/Btn.vue'
import Loading from '@/components/Loading.vue'
import { request } from '@/utils/request'
import type { DictionaryRecord, DictionaryWordAnalysis } from 'shared/types/dictionary'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import Modal from '@/components/Modal.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useToastStore } from '@/store/toast'

const toastStore = useToastStore()
const route = useRoute()
const router = useRouter()

const word = ref('')
const searchWord = ref('')
const result = ref<DictionaryWordAnalysis | null>(null)
const recent = ref<Partial<DictionaryRecord>[]>([])
const searchResults = ref<Partial<DictionaryRecord>[]>([])
const rootGroups = ref<
  {
    root: string
    label: string
    count: number
    words: { word: string; wordLower: string; updatedAt?: string }[]
  }[]
>([])
const loading = ref(false)
const searchLoading = ref(false)
const hasTemporaryOverwrite = ref(false)
const currentTab = ref<'action' | 'list'>('list')
const showSearchPanel = ref(false)
const searchTimer = ref<number | null>(null)

const canSearch = computed(() => !!searchWord.value.trim() && !loading.value)
const canDelete = computed(() => !!word.value.trim() && !loading.value)
const canRequery = computed(() => !!word.value.trim() && !loading.value)
const pageMode = computed<'home' | 'root' | 'word'>(() => {
  if (route.name === 'dictionaryRoot') return 'root'
  if (route.name === 'dictionaryWord') return 'word'
  return 'home'
})
const currentRootSlug = computed(() => `${route.params.rootSlug || ''}`)
const currentRootValue = computed(() =>
  currentRootSlug.value === '__NO_ROOT__' ? '' : decodeURIComponent(currentRootSlug.value),
)
const currentRootGroup = computed(() =>
  rootGroups.value.find((item) => item.root === currentRootValue.value) || null,
)

const navItems = computed(() => [
  { key: 'back', label: '‹ 返回' },
  { key: 'action', label: '查询', active: currentTab.value === 'action' },
  { key: 'list', label: '词库', active: currentTab.value === 'list' },
])

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

const loadRootGroups = async () => {
  const res = await request('dictionary/roots', 'get', undefined, { withCredentials: false })
  rootGroups.value = Array.isArray(res?.items) ? res.items : []
}

const scheduleSearch = (keyword: string) => {
  if (searchTimer.value) {
    window.clearTimeout(searchTimer.value)
  }
  searchTimer.value = window.setTimeout(() => {
    void loadSearchPanel(keyword)
  }, 180)
}

const analyze = async (targetWord?: string, isoverwirte = false, navigate = true) => {
  const q = `${targetWord || searchWord.value}`.trim()
  if (!q || loading.value) return

  loading.value = true

  try {
    const res = await request(
      'dictionary/analyze',
      'post',
      { word: q, isoverwirte },
      { withCredentials: false }
    )

    result.value = (res?.data || null) as DictionaryWordAnalysis | null
    word.value = `${res?.word || result.value?.word || q}`
    hasTemporaryOverwrite.value = !!res?.isoverwirte

    if (res?.exists === false) {
      result.value = null
      toastStore.showToast({
        content: res?.message || '这个词不存在',
        type: 'ERR',
      })
      return
    }

    if (navigate) {
      await router.push({ name: 'dictionaryWord', params: { word: word.value } })
    }

    await loadRecent()
    await loadSearchPanel(word.value)
    await loadRootGroups()
    showSearchPanel.value = false
    currentTab.value = 'list'
  } catch (err: any) {
    toastStore.showToast({
      content: err?.response?.data?.message || err?.message || '查询失败，请稍后重试',
      type: 'ERR',
    })
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

const overwrite = async () => {
  const q = `${word.value || ''}`.trim()
  if (!q || loading.value || !hasTemporaryOverwrite.value) return

  const confirmed = window.confirm(`确认覆盖单词 ${q} 吗？`)
  if (!confirmed) return

  loading.value = true

  try {
    await request('dictionary/overwrite', 'post', { word: q }, { withCredentials: false })
    hasTemporaryOverwrite.value = false
    toastStore.showToast({ content: '覆盖成功', type: 'OK' })
    await loadRootGroups()
    await analyze(q)
  } catch (err: any) {
    toastStore.showToast({
      content: err?.response?.data?.message || err?.message || '覆盖失败，请稍后重试',
      type: 'ERR',
    })
  } finally {
    loading.value = false
  }
}

const removeWord = async () => {
  const q = `${word.value || ''}`.trim()
  if (!q || loading.value) return

  const confirmed = window.confirm(`确认删除单词 ${q} 吗？`)
  if (!confirmed) return

  loading.value = true
  try {
    const res = await request('dictionary/delete', 'post', { word: q }, { withCredentials: false })
    if (res?.tempCleared) {
      hasTemporaryOverwrite.value = false
    }

    result.value = null
    word.value = ''
    searchWord.value = ''
    currentTab.value = 'list'
    showSearchPanel.value = false
    await router.push({ name: 'dictionary' })

    await loadRecent()
    await loadSearchPanel('')
    await loadRootGroups()

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

const goRoot = (root: string) => {
  const rootSlug = root ? encodeURIComponent(root) : '__NO_ROOT__'
  currentTab.value = 'list'
  showSearchPanel.value = false
  void router.push({ name: 'dictionaryRoot', params: { rootSlug } })
}

const goWord = (targetWord: string) => {
  if (!targetWord) return
  void analyze(targetWord, false, true)
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
  word.value = ''
  hasTemporaryOverwrite.value = false
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
  void loadRootGroups()
  void syncByRoute()
})
</script>

<template>
  <List>
    <template #content>
      <PageHeader>
        <template #right>
          <Btn v-if="pageMode === 'word' && result" :disabled="!canRequery" small :loading="loading" @click="requery"
            >重新查询</Btn
          >
          <Btn v-if="pageMode === 'word' && result" :disabled="!canDelete" small type="danger" @click="removeWord"
            >删除</Btn
          >
          <Btn v-if="pageMode === 'word' && hasTemporaryOverwrite" :disabled="loading" small @click="overwrite()"
            >覆盖</Btn
          >
        </template>
      </PageHeader>
      <Card v-if="pageMode === 'home'">
        <template #title>词库</template>
        <div class="search-results">
          <div v-if="!rootGroups.length" class="empty-text">no result</div>
          <div v-for="group in rootGroups" :key="group.root || '__NO_ROOT__'" class="item" @click="goRoot(group.root)">
            <div class="text">{{ group.label }} ({{ group.count }})</div>
          </div>
        </div>
      </Card>

      <Card v-if="pageMode === 'root'">
        <template #title>{{ currentRootGroup?.label || '无词根' }}</template>
        <div class="search-results">
          <div v-if="!currentRootGroup || !currentRootGroup.words.length" class="empty-text">no result</div>
          <div
            v-for="w in currentRootGroup?.words || []"
            :key="w.wordLower"
            class="item"
            @click="goWord(w.word)"
          >
            <span>{{ w.word }}</span>
          </div>
        </div>
      </Card>

      <div class="display" v-if="pageMode === 'word' && result">
        <div class="word">{{ result.word }}</div>
        <Card>
          <div class="text">{{ result.rootAnalysis.root }}</div>
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

  .cognates-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
}

.recent-word {
  font-weight: 600;
}

.loading-wrap {
  display: flex;
  align-items: center;
  gap: 0.75rem;
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
