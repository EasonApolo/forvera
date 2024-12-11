<script setup lang="ts">
import Btn from '@/components/Btn.vue'
import Card from '@/components/Card.vue'
import List from '@/components/layout/List.vue'
import { request } from '@/utils/request'
import { onMounted, ref, computed } from 'vue'

interface TreeNode {
  key?: string
  title: string
  children: TreeNode[]
}
interface RatingDocument {
  id: number
  title: string
  date: string
  type: string
  comments: {
    id: number
    content: string
    rate: number
  }[]
}

const types = ref<TreeNode[]>([])
const path = ref<number[]>([])
const documents = ref<RatingDocument[]>([])
const pageSize = ref(10)
const pageNumber = ref(1)
const hasMore = ref(true)
const loading = ref({
  search: false,
  create: false,
  fetch: false,
})

onMounted(() => {
  fetchTypes()
})
const fetchTypes = async () => {
  types.value = await request('documents/types', 'GET')
}
const selectPath = (index: number) => {
  path.value = path.value.slice(0, index)
}
const selectNode = (index: number) => {
  path.value.push(index)
  pageNumber.value = 1
  documents.value = []
  fetchDocuments() // Fetch documents based on the selected type
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
    }
    documents.value = [...documents.value, ...data]
    pageNumber.value++
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
  search.value.done = false
  search.value.result = []
  search.value.selected = null
  search.value.result = await request('documents/search', 'GET', {
    query: search.value.query,
  })
  search.value.done = true
  loading.value.search = false
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
  })
  loading.value.create = false
  await fetchDocuments({ refresh: true })
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
        <template v-if="node.key === 'movie'">
          <div class="card-group-name">创建</div>
          <Card class="create">
            <div class="search-input">
              <input
                class="text-input login-input"
                v-model="search.query"
                placeholder="title"
              />
              <Btn type="primary" @click="searchMovie" :loading="loading.search"
                >搜索</Btn
              >
            </div>
            <div v-if="search.done" class="search-result">
              <div
                v-for="res in search.result"
                :key="res.id"
                class="result-card"
                :class="{ selected: search.selected === res }"
                @click="search.selected = res"
              >
                <div @click.stop="openUrlInNewPage(res.url)">
                  {{ res.title }}
                </div>
                <div>sub: {{ res.sub_title }}</div>
                <div @click.stop="openUrlInNewPage(res.img)">img</div>
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
        <Card v-for="document in documents" :key="document.id">
          <h4>{{ document.title }}</h4>
          <p>{{ document.date }}</p>
          <p>{{ document.type }}</p>
          <p v-for="comment in document.comments" :key="comment.id">
            {{ comment.content }} - {{ comment.rate }}
          </p>
        </Card>
        <div v-if="!hasMore">--没有更多了哦--</div>
      </template>
    </List>
  </div>
</template>

<style scoped lang="scss">
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
    color: rgb(31, 189, 31);
    cursor: pointer;
  }
  .divider {
    margin: 0 8px;
  }
  .file {
    color: rgb(221, 96, 96);
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
  }
  .submit-button {
    margin-top: 16px;
    flex: 0 0 auto;
  }
}
</style>
