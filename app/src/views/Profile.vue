<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import { useUserStore } from '../store/user'
import Btn from '../components/Btn.vue'
import { useMainStore } from '../store/main'
import { usePostStore } from '../store/post'
import { formatDate } from '../utils/common'
import { useWriteStore } from '../store/write'
import { useToastStore } from '../store/toast'
import { useThemeStore } from '../store/theme'

const [userStore, mainStore, postStore, writeStore, toastStore] = [
  useUserStore(),
  useMainStore(),
  usePostStore(),
  useWriteStore(),
  useToastStore(),
]
const themeStore = useThemeStore()
const { isDark } = storeToRefs(themeStore)
const { userInfo } = storeToRefs(userStore)
const { myPosts } = storeToRefs(postStore)

onMounted(async () => {
  await userStore.getUserInfo()
  postStore.fetchMyPosts()
})

const logout = async () => {
  userStore.logout()
  toastStore.showToast({ content: '已登出～', type: 'OK' })
  mainStore.router.push({ name: 'login', query: { redirect: '/profile' } })
}
const loading = ref({ write: false })

// 前往各个路由
const goWrite = (postId: string) => {
  mainStore.router.push({ name: 'write', params: { postId } })
}
const create = async () => {
  loading.value.write = true
  await writeStore.init()
  loading.value.write = false
  goWrite(writeStore.postId)
}
const edit = async (postId: string) => {
  goWrite(postId)
}
const goCategory = () => {
  mainStore.router.push({ name: 'category' })
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="item user-info-bar">
        <div>{{ userInfo.username }}</div>
        <div class="user-actions">
          <Btn @click="themeStore.toggle()">{{ isDark ? '☀️' : '🌙' }}</Btn>
          <Btn @click="logout">登出</Btn>
        </div>
      </Card>
      <div class="card-group">
        <div class="card-group-name">导航</div>
        <Card class="item card-group">
          <div class="actions">
            <Btn @click="create" :loading="loading.write">写文章</Btn>
            <Btn @click="goCategory">编辑分类</Btn>
          </div>
        </Card>
      </div>
      <div class="my-posts card-group">
        <div class="card-group-name">文章列表</div>
        <Card
          class="item post"
          v-for="post in myPosts"
          :class="{ hidden: post.status !== 1 }"
        >
          <div class="post-info">
            <span class="title">{{ post.title }}</span>
            <span class="desc">{{ formatDate(post.updated_time) }}</span>
            <div v-if="post.status !== 1" class="status">隐藏</div>
          </div>
          <div class="post-actions">
            <Btn @click="edit(post._id)">修改</Btn>
          </div>
        </Card>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
.item {
  &:not(:first-child) {
    margin-top: 0.5rem;
  }
}

.user-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .user-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
}

.actions {
  display: flex;

  > div {
    margin-right: 1rem;
  }
}

.my-posts {
  .post {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .post-info {
      display: flex;
      align-items: center;

      .title {
        max-width: 6rem;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .desc {
        margin-left: 0.5rem;
        font-size: 14px;
        color: var(--text-secondary);
      }

      .status {
        margin-left: 0.5rem;
        font-size: 13px;
        color: #666;
      }
    }
  }

  .hidden {
    background-color: var(--hidden-post-bg);
  }
}
</style>
