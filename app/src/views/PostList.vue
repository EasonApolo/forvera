<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMainStore } from '../store/main'
import { usePostStore } from '../store/post'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import List from '../components/layout/List.vue'
import HorizontalScroll from '../components/layout/HorizontalScroll.vue'
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
  // 检查是否已经拿到 category 接口数据
  if (!categories.value.length) {
    return []
  }

  const now = Date.now()
  const threeMonthsAgo = now - (3600 * 24 * 30 * 3 * 1000) // 最近3个月
  type PostGroup = { name: string; posts: Post[] }
  
  // 初始化分组
  const groups: PostGroup[] = []
  const recentGroup: PostGroup = { name: '最近', posts: [] }
  const yearGroups: Record<string, PostGroup> = {}

  // 遍历过滤后的文章
  filteredPosts.value.forEach(post => {
    const updatedDate = new Date(post.updated_time)
    const updatedTime = updatedDate.getTime()

    if (updatedTime >= threeMonthsAgo) {
      // 最近3个月的文章
      recentGroup.posts.push(post)
    } else {
      // 按年份分组
      const year = `${updatedDate.getFullYear()}`
      if (!yearGroups[year]) {
        yearGroups[year] = { name: year, posts: [] }
      }
      yearGroups[year].posts.push(post)
    }
  })

  // 添加最近分组（如果有文章）
  if (recentGroup.posts.length > 0) {
    groups.push(recentGroup)
  }

  // 添加年份分组（按年份降序）
  Object.values(yearGroups)
    .sort((a, b) => parseInt(b.name) - parseInt(a.name))
    .forEach(group => {
      groups.push(group)
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
  mainStore.router.push({ name: 'post', params: { postId } })
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="categories-wrapper" @mousedown.stop>
        <span style="color: var(--text-secondary)">分类</span>
        <HorizontalScroll class="categories">
          <Btn
            :type="activeCatId === cat._id ? 'primary' : undefined"
            v-for="cat in categories"
            @click="filterByCategory(cat)"
            >{{ cat.title }}</Btn
          >
        </HorizontalScroll>
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
    margin-left: 1rem;
  }
}

.post-group {
  margin-top: 1rem;
  .group-name {
    margin: 0 0 0.5rem 3px;
    text-align: left;
    font-size: 14px;
    color: var(--text-muted);
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
        color: var(--text-muted);

        div:not(:last-child) {
          margin-right: 0.25rem;

          &::after {
            content: ' /';
          }
        }
      }

      .date {
        font-size: 12px;
        color: var(--text-secondary);
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
  background-color: var(--code-bg);
  padding: 2px 4px;
  border-radius: 4px;
  color: var(--text);
}
</style>
