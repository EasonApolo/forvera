<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMainStore } from '../store/main'
import { usePostStore } from '../store/post'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import Label from '../components/Label.vue'
import { usePostDetail } from '../store/postDetail'
import { formatDate } from '../utils/common'
import { useCategories } from '@/store/category'
import { computed, ref } from 'vue'

const [mainStore, postStore, categoryStore] = [
  useMainStore(),
  usePostStore(),
  useCategories(),
]
postStore.fetchPosts()
const { posts } = storeToRefs(postStore)
categoryStore.init()
const { categories } = storeToRefs(categoryStore)

const groupedPosts = computed(() => {
  const now = Date.now()
  const month = 3600 * 24 * 30 * 1000
  type PostGroup = { name: string; posts: Post[] }
  let group = {} as PostGroup
  const groups: PostGroup[] = []
  filteredPosts.value.map(post => {
    const updatedDate = new Date(post.updated_time)
    if (now - updatedDate.getTime() < month) {
      if (!group.name) {
        group = { name: 'Recent', posts: [post] }
        groups.push(group)
      } else group.posts.push(post)
    } else {
      const year = `${updatedDate.getFullYear()}`
      if (group.name !== year) {
        group = { name: year, posts: [post] }
        groups.push(group)
      } else {
        group.posts.push(post)
      }
    }
  })
  return groups
})

let activeCatId = ref('')
const filterByCategory = (category: Category) => {
  if (activeCatId.value === category._id) activeCatId.value = ''
  else activeCatId.value = category._id
}
const filteredPosts = computed(() => {
  return activeCatId.value
    ? posts.value.filter(post => post.category.includes(activeCatId.value))
    : posts.value
})

const read = (postId: string) => {
  const postDetailStore = usePostDetail()
  postDetailStore.init(postId)
  mainStore.go('post')
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="categories-wrapper" @mousedown.stop>
        <span style="color: #888">分类</span>
        <div class="categories">
          <Label
            :active="activeCatId === cat._id"
            v-for="cat in categories"
            @click="filterByCategory(cat)"
            >{{ cat.title }}</Label
          >
        </div>
      </Card>
      <div v-for="group in groupedPosts" :key="group.name" class="post-group">
        <div class="group-name">{{ group.name }}</div>
        <Card class="post" v-for="post in group.posts" @click="read(post._id)">
          <div class="left">{{ post.title || '无标题' }}</div>
          <div class="right">
            <div class="date">{{ formatDate(post.updated_time) }}</div>
            <div class="post-cat" v-if="categories">
              <div v-for="cat in post.category">
                {{ categories.find(catInfo => catInfo._id === cat)?.title }}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
.categories-wrapper {
  display: flex;
  align-items: center;
  padding: 0.5rem 1rem;

  span {
    flex: 0 0 auto;
  }

  .categories {
    display: flex;
    align-items: center;
    margin-left: 1rem;
    overflow: auto;

    * {
      flex: 0 0 auto;
      margin-right: 1rem;
    }
  }
}

.post-group {
  margin-top: 1rem;
  .group-name {
    margin: 0 0 0.5rem 3px;
    text-align: left;
    font-size: 14px;
    color: #aaa;
    font-family: Avenir, Helvetica, Arial, sans-serif;
  }
  .post {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;

    .left {
      text-align: left;
    }

    .right {
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
      align-items: flex-end;

      .post-cat {
        display: flex;
        font-size: 12px;
        color: #aaa;

        div:not(:last-child) {
          margin-right: 0.25rem;

          &::after {
            content: ' /';
          }
        }
      }

      .date {
        font-size: 12px;
        color: #888;
      }
    }
  }
}

a {
  color: #42b983;
}

label {
  margin: 0 0.5em;
  font-weight: bold;
}

code {
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 4px;
  color: #304455;
}
</style>
