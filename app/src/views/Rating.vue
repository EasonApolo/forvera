<script setup lang="ts">
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import GreyText from '@/components/GreyText.vue'
import Input from '@/components/Input.vue'
import Textarea from '@/components/Textarea.vue'
import List from '@/components/layout/List.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { request } from '@/utils/request'
import { onMounted, ref, computed } from 'vue'
import RatingComponent from '@/components/RatingComponent.vue'
import StepperFilter from '@/components/StepperFilter.vue'
import { formatDate } from '@/utils/common'
import { useUserStore } from '@/store/user'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/store/toast'

interface TreeNode {
  key?: string
  title: string
  children: TreeNode[]
}
interface RatingDocument {
  _id: string
  id: string
  title: string
  date?: string
  type: string
  episode?: string // '26'
  img?: string
  url?: string
  sub_title?: string
  comments: Comment[]
}
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
const router = useRouter()
const toastStore = useToastStore()

const types = ref<TreeNode[]>([])
const path = ref<number[]>([])
const documents = ref<RatingDocument[]>([])
const editable = computed(() => userInfo.value.role === 3)
const loading = ref({
  search: false,
  create: false,
  fetch: false,
  comment: false,
})

const navItems = [{ key: 'back', label: '‹ 返回' }]

const handleNavSelect = (key: string) => {
  if (key === 'back') {
    router.push({ name: 'playground' })
  }
}

onMounted(() => {
  fetchTypes()
})
const fetchTypes = async () => {
  types.value = await request('documents/types', 'GET')
}
const selectPath = (index: number) => {
  path.value = path.value.slice(0, index)
  onPathChange()
}
const selectNode = (index: number) => {
  path.value.push(index)
  onPathChange()
}
const onPathChange = () => {
  clearSearch()
  resetMovieFilters()
  fetchDocuments({ refresh: true })
}
const pathSegs = computed(() => {
  const tmp: string[] = []
  path.value.reduce((acc, cur) => {
    tmp.push(acc[cur].title)
    return acc[cur].children
  }, types.value)
  return tmp
})
const node = computed(() => {
  let currentNode: TreeNode = { title: '', children: types.value }
  for (const index of path.value) {
    currentNode = currentNode.children?.[index] || { children: [] }
  }
  return currentNode
})

const fetchDocuments = async ({ refresh }: { refresh?: boolean } = {}) => {
  loading.value.fetch = true
  if (node.value?.key) {
    const data = await request('documents', 'GET', {
      type: node.value.key,
    })
    documents.value = [...data]
  } else if (refresh) {
    documents.value = []
  }
  loading.value.fetch = false
}

/**
 * search
 */
interface Movie {
  episode: string // '26'
  img: string
  title: string
  url: string
  type: 'movie'
  year: string // '2011'
  sub_title: string
  id: string // '4848701'
}
const search = ref({
  query: '',
  done: false,
  result: [] as Movie[],
  selected: null as Movie | null,
})
const searchMovie = async () => {
  loading.value.search = true
  search.value.selected = null
  try {
    search.value.result = await request('documents/search', 'GET', {
      query: search.value.query,
    })
  } catch (error) {
  } finally {
    search.value.done = true
    loading.value.search = false
  }
}
const clearSearch = () => {
  search.value.query = ''
  search.value.done = false
  search.value.result = []
  search.value.selected = null
}
const openUrlInNewPage = (url: string) => {
  window.open(url, '_blank', 'noopener noreferrer')
}

const getLatestCommentTime = (document: RatingDocument) => {
  const comments = Array.isArray(document.comments) ? document.comments : []
  const timestamps = comments
    .map(comment => new Date(comment.createdAt).getTime())
    .filter(time => Number.isFinite(time))
  if (!timestamps.length) return 0
  return Math.max(...timestamps)
}

const getSortedComments = (document: RatingDocument) => {
  const comments = Array.isArray(document.comments) ? [...document.comments] : []
  return comments.sort((a, b) => {
    const t1 = new Date(a.createdAt).getTime()
    const t2 = new Date(b.createdAt).getTime()
    return t2 - t1
  })
}

const getLatestComment = (document: RatingDocument) => {
  const comments = getSortedComments(document)
  return comments.length ? comments[0] : null
}

const getDisplayDate = (document: RatingDocument) => {
  return typeof document.date === 'string' ? document.date.trim() : ''
}

const getCommentYears = (document: RatingDocument) => {
  const comments = Array.isArray(document.comments) ? document.comments : []
  const years = comments
    .map(comment => new Date(comment.createdAt).getFullYear())
    .filter(year => Number.isFinite(year))
  return new Set(years)
}

const createDocument = async () => {
  if (!search.value.selected || node.value.key === undefined) {
    return
  }
  loading.value.create = true
  await request('documents/add', 'POST', {
    id: search.value.selected.id,
    title: search.value.selected.title,
    date: search.value.selected.year,
    type: node.value.key,
    episode: search.value.selected.episode,
    img: search.value.selected.img,
    sub_title: search.value.selected.sub_title,
    url: search.value.selected.url,
  })
  clearSearch()
  loading.value.create = false
  await fetchDocuments({ refresh: true })
}
const deleteDocument = async (documentId: string) => {
  if (confirm('确定要删除吗？')) {
    await request('documents', 'DELETE', {
      documentId,
    })
    await fetchDocuments({ refresh: true })
  }
}

/**
 * Comment
 */
interface Comment {
  _id: string
  rate: number | null
  content: string
  createdAt: string
  updatedAt: string
}
const commenting = ref({
  text: '',
  rating: null as number | null,
  documentId: undefined as string | undefined,
  commentId: undefined as string | undefined,
  isEdit: false,
})
const addComment = (documentId: string) => {
  commenting.value.documentId = documentId
}
const editComment = (documentId: string, comment: Comment) => {
  commenting.value.commentId = comment._id
  commenting.value.rating = comment.rate
  commenting.value.text = comment.content
  commenting.value.isEdit = true
  commenting.value.documentId = documentId
}
const deleteComment = async (documentId: string, commentId: string) => {
  if (confirm('确定要删除吗？')) {
    const target = documents.value.find(item => item._id === documentId)
    if (target && target.comments.length <= 1) {
      toastStore.showToast({ content: '不能删除最后一条评论', type: '!' })
      return
    }
    const newDoc = await request('documents/comment', 'DELETE', {
      documentId,
      commentId,
    })
    documents.value = documents.value.map(item => {
      if (item._id === documentId) {
        return newDoc
      } else {
        return item
      }
    })
  }
}
const submitComment = async () => {
  if (
    !commenting.value.documentId ||
    (commenting.value.isEdit && !commenting.value.commentId)
  ) {
    return
  }
  loading.value.comment = true
  try {
    let newDoc: RatingDocument
    if (commenting.value.isEdit) {
      newDoc = await request('documents/comment', 'PUT', {
        documentId: commenting.value.documentId,
        commentId: commenting.value.commentId,
        content: commenting.value.text,
        rate: commenting.value.rating,
      })
    } else {
      newDoc = await request('documents/comment', 'POST', {
        documentId: commenting.value.documentId,
        content: commenting.value.text,
        rate: commenting.value.rating,
      })
    }
    documents.value = documents.value.map(item => {
      if (item._id === commenting.value.documentId) {
        return newDoc
      } else {
        return item
      }
    })
    initCommenting()
  } catch (err) {
  } finally {
    loading.value.comment = false
  }
}
const initCommenting = () => {
  commenting.value.text = ''
  commenting.value.rating = null
  commenting.value.documentId = undefined
  commenting.value.commentId = undefined
  commenting.value.isEdit = false
}
const cancelComment = () => {
  initCommenting()
}

/**
 * Movie filters
 */
const currentYear = new Date().getFullYear()
const movieFilters = ref({
  rating: null as number | null,
  query: '',
  year: null as number | null,
  watchCount: null as number | null,
})

const resetMovieFilters = () => {
  movieFilters.value.rating = null
  movieFilters.value.query = ''
  movieFilters.value.year = null
  movieFilters.value.watchCount = null
}

const clearMovieQuery = () => {
  movieFilters.value.query = ''
}

const filteredDocuments = computed(() => {
  if (node.value.key !== 'movie') {
    return documents.value
  }

  let list = [...documents.value]
  const query = movieFilters.value.query.trim().toLowerCase()

  if (movieFilters.value.rating !== null) {
    list = list.filter(doc => {
      const latestComment = getLatestComment(doc)
      if (!latestComment || latestComment.rate === null) {
        return false
      }
      return latestComment.rate === movieFilters.value.rating
    })
  }

  if (query) {
    list = list.filter(doc => {
      const title = (doc.title || '').toLowerCase()
      const subTitle = (doc.sub_title || '').toLowerCase()
      return title.includes(query) || subTitle.includes(query)
    })
  }

  if (movieFilters.value.year !== null) {
    list = list.filter(doc => {
      return getCommentYears(doc).has(movieFilters.value.year as number)
    })
  }

  if (movieFilters.value.watchCount !== null) {
    list = list.filter(doc => doc.comments.length === movieFilters.value.watchCount)
  }

  return list.sort((a, b) => getLatestCommentTime(b) - getLatestCommentTime(a))
})
</script>

<template>
  <div>
    <List>
      <template #content>
        <GreyText>分类</GreyText>
        <Card class="path-chooser">
          <div class="dash">/</div>
          <template v-for="(seg, index) in pathSegs" :key="index">
            <div className="path-segment" @click="selectPath(index)">
              {{ seg }}
            </div>
            <div class="dash">/</div>
          </template>
          <div class="divider">></div>
          <div
            class="file"
            v-for="(child, index) in node.children"
            :key="index"
            @click="selectNode(index)"
          >
            {{ child.title }}
          </div>
        </Card>

        <template v-if="editable && node.key === 'movie'">
          <GreyText>创建</GreyText>
          <Card class="create">
            <div class="search-input">
              <Input
                class="login-input"
                v-model="search.query"
                placeholder="title"
                @keypress.enter="searchMovie"
              />
              <Btn type="primary" @click="searchMovie" :loading="loading.search"
                >搜索</Btn
              >
            </div>
            <div v-if="search.done" class="search-result">
              <div v-if="search.result.length === 0" class="no-result">
                没搜到
              </div>
              <div
                v-for="res in search.result"
                :key="res.id"
                class="result-card"
                :class="{ selected: search.selected === res }"
                @click="search.selected = res"
              >
                <div class="link" @click.stop="openUrlInNewPage(res.url)">
                  {{ res.title }}
                </div>
                <div>sub: {{ res.sub_title }}</div>
                <div class="link" @click.stop="openUrlInNewPage(res.img)">
                  img
                </div>
                <div>year: {{ res.year }}</div>
                <div>id: {{ res.id }}</div>
                <div>type: {{ res.type }}</div>
                <div>episode: {{ res.episode }}</div>
              </div>
            </div>
            <div v-if="search.done && search.selected" class="flex">
              <Btn
                class="submit-button"
                @click="createDocument"
                :loading="loading.create"
                >创建</Btn
              >
            </div>
          </Card>
        </template>

        <template v-if="node.key === 'movie'">
          <GreyText>筛选</GreyText>
          <Card class="movie-filter">
            <div class="filter-item">
              <div class="filter-label">评分</div>
              <RatingComponent
                :value="movieFilters.rating"
                @update:value="movieFilters.rating = $event"
              ></RatingComponent>
            </div>
            <div class="filter-item">
              <div class="filter-label">搜索</div>
              <div class="search-row">
                <Input
                  class="login-input"
                  v-model="movieFilters.query"
                  placeholder="输入关键词"
                />
                <Btn v-if="movieFilters.query" @click="clearMovieQuery"
                  >取消</Btn
                >
              </div>
            </div>
            <div class="filter-item">
              <div class="filter-label">观看年份</div>
              <StepperFilter
                :value="movieFilters.year"
                :max="currentYear"
                nullable-position="max"
                @update:value="movieFilters.year = typeof $event === 'number' || $event === null ? $event : null"
              />
            </div>
            <div class="filter-item">
              <div class="filter-label">观看次数</div>
              <StepperFilter
                :value="movieFilters.watchCount"
                :min="1"
                nullable-position="min"
                @update:value="movieFilters.watchCount = typeof $event === 'number' || $event === null ? $event : null"
              />
            </div>
          </Card>
        </template>

        <GreyText>
          记录
          <span v-if="node.key === 'movie'" class="movie-total">
            ({{ filteredDocuments.length }}项)
          </span>
        </GreyText>
        <Card
          v-for="document in filteredDocuments"
          :key="document.id"
          class="document-card"
        >
          <div class="content">
            <div class="left">
              <div class="title-row">
                <div
                  class="title link"
                  @click="document.url && openUrlInNewPage(document.url)"
                >
                  {{ document.title }}
                </div>
                <span v-if="getDisplayDate(document)" class="title-year">
                  ({{ getDisplayDate(document) }})
                </span>
              </div>
            </div>
            <div v-if="editable" class="right">
              <span class="action" @click="addComment(document._id)">新增评论</span>
              <span class="action" @click="deleteDocument(document._id)">删除</span>
            </div>
          </div>
          <div
            v-if="document._id === commenting.documentId"
            class="comment-area"
          >
            <Textarea v-model="commenting.text" />
            <div class="controls">
              <RatingComponent
                :value="commenting.rating"
                @update:value="commenting.rating = $event"
                class="rating"
              ></RatingComponent>
              <Btn class="submit-button" type="primary" @click="submitComment"
                >评论</Btn
              >
              <Btn @click="cancelComment">取消</Btn>
            </div>
          </div>

          <div v-if="document.comments.length > 0" class="comments">
            <div
              v-for="comment in getSortedComments(document)"
              :key="comment._id"
              class="comment-card"
            >
              <div class="controls">
                <RatingComponent
                  class="rating"
                  :value="comment.rate"
                  :readonly="true"
                ></RatingComponent>
                <div
                  v-if="editable"
                  class="action"
                  @click="editComment(document._id, comment)"
                >编辑</div>
                <div
                  v-if="editable"
                  class="action"
                  @click="deleteComment(document._id, comment._id)"
                >删除</div>
              </div>
              <div class="date-str">{{ formatDate(comment.createdAt) }}</div>
              <div v-if="comment.content" class="content">
                {{ comment.content }}
              </div>
            </div>
          </div>
        </Card>
        <div v-if="!node.key" class="ending">——— 选择分类 ———</div>

        <BottomNavBar :items="navItems" @select="handleNavSelect" />
      </template>
    </List>
  </div>
</template>

<style scoped lang="less">
.path-chooser {
  display: flex;
  align-items: center;
  div {
    height: 16px;
    line-height: 16px;
  }
  .dash {
    margin: 0 8px;
  }
  .path-segment {
    color: #42b983;
    cursor: pointer;
  }
  .divider {
    margin: 0 8px;
  }
  .file {
    color: #42b983;
    margin: 0 8px;
    cursor: pointer;
  }
}
.create {
  .search-input {
    display: flex;
    height: 34px;
    .button {
      margin-left: 16px;
      flex: 0 0 auto;
    }
  }
  .search-result {
    display: flex;
    margin-top: 16px;
    row-gap: 16px;
    column-gap: 16px;
    flex-wrap: wrap;
    .result-card {
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      max-width: 156px;
      cursor: pointer;
      transition: border 0.2s ease;
    }
    .selected {
      border: 1px solid blue;
    }
    .no-result {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
  }
  .submit-button {
    margin-top: 16px;
    flex: 0 0 auto;
  }
}

.movie-filter {

  .filter-item {
    flex: 0 0 auto;
    min-width: 280px;
    display: flex;
    align-items: center;
    column-gap: 12px;
    &:not(:last-child) {
      margin-bottom: 16px;
    }
  }

  .filter-label {
    margin-bottom: 0;
    flex: 0 0 auto;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .search-row {
    display: flex;
    align-items: center;
    column-gap: 8px;

    input {
      width: 160px;
    }
  }
}

.movie-total {
  margin-top: 8px;
  text-align: left;
  font-size: 0.875rem;
}

:deep(.list-content) {
  margin-bottom: 4.5rem;
}

.document-card {
  .content {
    display: flex;
    .left {
      flex: 1 1 auto;
      display: flex;
      flex-wrap: wrap;
      .title-row {
        flex: 0 0 100%;
        display: flex;
        align-items: baseline;
        gap: 0.35rem;
        margin-bottom: 8px;

        .title {
          text-align: left;
          font-weight: bold;
        }

        .title-year {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
      }
      .meta {
        font-size: 0.875rem;
        margin-right: 8px;
      }
      .meta:not(.link) {
        font-size: 0.875rem;
        color: var(--text-secondary);
      }
    }
    .right {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: nowrap;
      height: 24px;
      line-height: 24px;
      column-gap: 8px;
      display: none;

      .action {
        font-size: 12px;
        color: var(--text-muted);
        cursor: pointer;
      }
    }
    &:hover .right {
      display: flex;
    }
  }
  .comment-area {
    .text-input {
      margin-top: 16px;
    }
    .controls {
      margin-top: 16px;
      display: flex;
      align-items: center;
      .rating {
        margin-right: 16px;
      }
      .submit-button {
        margin-right: 16px;
      }
    }
  }
  .comments {
    margin-top: 16px;
    display: flex;
    row-gap: 16px;
    column-gap: 16px;
    flex-wrap: wrap;
    .comment-card {
      background: var(--quote-bg);
      border-radius: 4px;
      padding: 8px;
      max-width: 100%;
      min-width: 160px;
      .controls {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        .rating {
          margin-right: auto;
        }
        .action {
          display: none;
          font-size: 12px;
          color: var(--text-muted);
          cursor: pointer;
          height: 12px;
          line-height: 12px;
          &:not(:last-child) {
            margin-right: 8px;
          }
        }
      }
      &:hover .controls .action {
        display: flex;
      }
      .date-str {
        margin-top: 4px;
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-align: left;
      }
      .content {
        margin-top: 4px;
        text-align: left;
        font-size: 0.875rem;
      }
    }
  }
}
</style>
