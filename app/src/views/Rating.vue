<script setup lang="ts">
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import List from '@/components/layout/List.vue'
import { request } from '@/utils/request'
import { onMounted, ref, computed } from 'vue'
import RatingComponent from '@/components/RatingComponent.vue'
import Icon from '@/components/Icon.vue'
import { formatDate } from '@/utils/common'
import { useUserStore } from '@/store/user'
import { storeToRefs } from 'pinia'

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

const types = ref<TreeNode[]>([])
const path = ref<number[]>([])
const documents = ref<RatingDocument[]>([])
const editable = computed(() => userInfo.value.role === 3)
const pageSize = ref(10)
const pageNumber = ref(1)
const hasMore = ref(true)
const loading = ref({
  search: false,
  create: false,
  fetch: false,
  comment: false,
})

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
    if (refresh) {
      pageNumber.value = 1
    }
    const data = await request('documents', 'GET', {
      type: node.value.key,
      pageSize: pageSize.value,
      pageNumber: pageNumber.value,
    })
    if (data.length < pageSize.value) {
      hasMore.value = false
    }
    if (refresh) {
      documents.value = [...data]
    } else {
      documents.value = [...documents.value, ...data]
    }
    pageNumber.value++
  } else if (refresh) {
    documents.value = []
  }
  loading.value.fetch = false
}
const onScroll = (e: any) => {
  let parentHeight = e.target.clientHeight
  let scrollHeight = e.target.scrollTop
  let childHeight =
    e.target.getElementsByClassName('layout-list')[0].clientHeight
  let atBottom = scrollHeight + parentHeight >= childHeight - 10 * 16
  if (atBottom && hasMore.value) {
    fetchDocuments()
  }
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
</script>

<template>
  <div>
    <List @scroll="onScroll">
      <template #content>
        <div class="card-group-name">分类</div>
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
          <div class="card-group-name">创建</div>
          <Card class="create">
            <div class="search-input">
              <input
                class="text-input login-input"
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

        <div class="card-group-name">记录</div>
        <Card
          v-for="document in documents"
          :key="document.id"
          class="document-card"
        >
          <div class="content">
            <div class="left">
              <div class="title">{{ document.title }}</div>
              <div v-if="document.date" class="meta">{{ document.date }}</div>
              <div
                v-if="document.episode && parseInt(document.episode) > 1"
                class="meta"
              >
                {{ document.episode }}eps
              </div>
              <div
                v-if="document.url"
                class="meta link"
                @click="openUrlInNewPage(document.url)"
              >
                url
              </div>
              <div
                v-if="document.img"
                class="meta link"
                @click="openUrlInNewPage(document.img)"
              >
                img
              </div>
            </div>
            <div v-if="editable" class="right">
              <Icon type="✏️" @click="addComment(document._id)" />
              <Icon type="🗑️" @click="deleteDocument(document._id)" />
            </div>
          </div>
          <div
            v-if="document._id === commenting.documentId"
            class="comment-area"
          >
            <textarea v-model="commenting.text" class="text-input"></textarea>
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
              v-for="comment in document.comments"
              :key="comment._id"
              class="comment-card"
            >
              <div class="controls">
                <RatingComponent
                  class="rating"
                  :value="comment.rate"
                  :readonly="true"
                ></RatingComponent>
                <Icon
                  v-if="editable"
                  class="btn"
                  type="✏️"
                  @click="editComment(document._id, comment)"
                />
                <Icon
                  v-if="editable"
                  class="btn"
                  type="🗑️"
                  @click="deleteComment(document._id, comment._id)"
                />
              </div>
              <div class="date-str">{{ formatDate(comment.createdAt) }}</div>
              <div v-if="comment.content" class="content">
                {{ comment.content }}
              </div>
            </div>
          </div>
        </Card>
        <div v-if="!hasMore" class="ending">——— 没有更多了哦 ———</div>
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
      border: 1px solid #ccc;
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
      color: #888;
    }
  }
  .submit-button {
    margin-top: 16px;
    flex: 0 0 auto;
  }
}
.document-card {
  .content {
    display: flex;
    .left {
      flex: 1 1 auto;
      display: flex;
      flex-wrap: wrap;
      .title {
        flex: 0 0 100%;
        text-align: left;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .meta {
        font-size: 0.875rem;
        margin-right: 8px;
      }
      .meta:not(.link) {
        font-size: 0.875rem;
        color: #888;
      }
    }
    .right {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: nowrap;
      height: 32px;
      column-gap: 8px;
      display: none;
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
      background: #f8f8f8;
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
        .btn {
          display: none;
          &:not(:last-child) {
            margin-right: 8px;
          }
        }
      }
      &:hover .controls .btn {
        display: flex;
      }
      .date-str {
        margin-top: 4px;
        font-size: 0.75rem;
        color: #888;
        text-align: left;
      }
      .content {
        margin-top: 8px;
        text-align: left;
      }
    }
  }
}
</style>
