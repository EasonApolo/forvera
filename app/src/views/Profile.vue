<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import List from '../components/layout/List.vue'
import HorizontalScroll from '../components/layout/HorizontalScroll.vue'
import Card from '../components/Card.vue'
import CircleBtn from '../components/CircleBtn.vue'
import GreyText from '../components/GreyText.vue'
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
const { isDark, mode } = storeToRefs(themeStore)
const { userInfo } = storeToRefs(userStore)
const { myPosts } = storeToRefs(postStore)
const isAdmin = computed(() => userInfo.value.role === 3)
const currentUserId = computed(() => `${(userInfo.value as any)._id || ''}`)

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

const goUserManage = () => {
  mainStore.router.push({ name: 'userManage' })
}

const goBackupManage = () => {
  mainStore.router.push({ name: 'backupManage' })
}

const getPostAuthorTag = (post: any) => {
  if (!isAdmin.value) return ''
  const author = post?.author
  const authorId = typeof author === 'string' ? author : author?._id
  if (`${authorId || ''}` === currentUserId.value) {
    return ''
  }
  const username = typeof author === 'object' ? author?.username : ''
  return username || '未知用户'
}

const themeIcon = computed(() => {
  if (mode.value === 'system') return '💻'
  return isDark.value ? '🌙' : '☀️'
})

const themeModeText = computed(() => {
  if (mode.value === 'system') return '跟随设备'
  return isDark.value ? '暗黑模式' : '浅色模式'
})
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="item user-info-bar">
        <div>{{ userInfo.username }}</div>
        <div class="user-actions">
          <CircleBtn
            :size="24"
            :font-size="12"
            :mobile-size="28"
            :mobile-font-size="14"
            aria-label="切换主题模式"
            :title="`主题：${themeModeText}（点击循环）`"
            @click="themeStore.cycleMode()"
          >
            {{ themeIcon }}
          </CircleBtn>
          <Btn @click="logout">登出</Btn>
        </div>
      </Card>
      <div class="card-group">
        <GreyText>导航</GreyText>
        <Card class="item card-group">
          <HorizontalScroll>
            <Btn @click="create" :loading="loading.write">写文章</Btn>
            <Btn @click="goCategory">编辑分类</Btn>
            <Btn v-if="isAdmin" @click="goUserManage">管理用户</Btn>
            <Btn v-if="isAdmin" @click="goBackupManage">备份管理</Btn>
          </HorizontalScroll>
        </Card>
      </div>
      <div class="my-posts card-group">
        <GreyText>文章列表</GreyText>
        <Card
          class="item post"
          v-for="post in myPosts"
          :class="{ hidden: post.status !== 1 }"
        >
          <div class="post-info">
            <div class="title-line">
              <span class="title">{{ post.title }}</span>
              <span class="author-tag" v-if="getPostAuthorTag(post)">by {{ getPostAuthorTag(post) }}</span>
              <div class="meta-inline">
                <span class="desc">{{ formatDate(post.updated_time) }}</span>
                <span class="desc">{{ formatDate(post.created_time) }}</span>
              </div>
                <span v-if="post.status !== 1" class="status">隐藏</span>
            </div>
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

.my-posts {
  .post {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .post-info {
      display: flex;
      align-items: center;
      min-width: 0;
      flex: 1;

      .title-line {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
      }

      .title {
        width: 8rem;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        text-align: left;
        flex: 0 0 auto;
      }

      .meta-inline {
        margin-left: .5rem;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 0.2rem;
        flex: 0 0 auto;
      }

      .desc {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .author-tag {
        margin-left: 0.5rem;
        font-size: 12px;
        color: var(--text-muted);
      }

      .status {
        margin-left: .5rem;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }
  }

  .hidden {
    background-color: rgba(127, 127, 127, 0.12);
  }
}
</style>
