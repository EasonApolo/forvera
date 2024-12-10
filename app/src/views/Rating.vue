<script setup lang="ts">
import Card from '@/components/Card.vue'
import List from '@/components/layout/List.vue'
import { request } from '@/utils/request'
import { onMounted, ref, computed } from 'vue'

interface TreeNode {
  key?: string
  title?: string
  children?: TreeNode[]
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

onMounted(() => {
  fetchTypes()
})
const fetchTypes = async () => {
  types.value = await request('documents/types', 'GET')
}
const selectNode = (index: number) => {
  path.value.push(index)
  pageNumber.value = 1
  documents.value = []
  fetchDocuments() // Fetch documents based on the selected type
}
const node = computed(() => {
  let currentNode: TreeNode = { children: types.value }
  for (const index of path.value) {
    currentNode = currentNode.children?.[index] || { children: [] }
  }
  return currentNode
})

const fetchDocuments = async () => {
  if (node.value?.key) {
    const data = await request('documents', 'GET', {
      type: node.value.key,
      pageSize: pageSize.value,
      pageNumber: pageNumber.value,
    })
    if (data.length < pageSize.value) {
      hasMore.value = false
    }
    documents.value = [...documents.value, ...data]
    pageNumber.value++
  }
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
</script>

<template>
  <div>
    <List @scroll="onScroll">
      <template #content>
        <Card
          @click="selectNode(index)"
          v-for="(child, index) in node.children"
          :key="index"
        >
          {{ child.title }}
        </Card>
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

<style scoped>
/* Add your styles here */
</style>
