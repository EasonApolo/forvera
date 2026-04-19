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
import axios from 'axios'
import { ip as baseURL } from '../config'
import { request } from '../utils/request'

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

const backupLoading = ref({ trigger: false, download: false, cleanup: false })

const getFilenameFromDisposition = (disposition?: string) => {
  if (!disposition) return `forvera-backup-${Date.now()}.zip`
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }
  const normalMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (normalMatch?.[1]) {
    return decodeURIComponent(normalMatch[1])
  }
  return `forvera-backup-${Date.now()}.zip`
}

const triggerBackup = async () => {
  if (!isAdmin.value) return
  backupLoading.value.trigger = true
  try {
    const result = await request('backup/trigger', 'POST')
    const timeText = result?.latest?.updatedAt
      ? formatDate(result.latest.updatedAt)
      : '未知时间'
    toastStore.showToast({ content: `备份完成：${timeText}`, type: 'OK' })
  } catch (error) {
    toastStore.showToast({ content: '触发备份失败', type: '!' })
  } finally {
    backupLoading.value.trigger = false
  }
}

const downloadBackup = async () => {
  if (!isAdmin.value) return
  backupLoading.value.download = true
  try {
    const latestInfo = await request('backup/latest-info', 'GET')
    if (!latestInfo?.exists) {
      toastStore.showToast({ content: '暂无备份可下载，请先触发备份', type: '!' })
      return
    }

    const latestTimeText = latestInfo?.updatedAt
      ? formatDate(latestInfo.updatedAt)
      : '未知时间'
    const ok = confirm(`最新备份时间：${latestTimeText}\n确认下载吗？`)
    if (!ok) {
      return
    }

    const res = await axios.get(`${baseURL}api/backup/latest`, {
      responseType: 'blob',
      withCredentials: true,
      headers: userInfo.value.token
        ? { Authorization: userInfo.value.token }
        : undefined,
    })
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getFilenameFromDisposition(res.headers['content-disposition'])
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(blobUrl)
    toastStore.showToast({ content: '备份下载开始', type: 'OK' })
  } catch (error) {
    toastStore.showToast({ content: '下载备份失败', type: '!' })
  } finally {
    backupLoading.value.download = false
  }
}

const cleanupBackups = async () => {
  if (!isAdmin.value) return
  if (!confirm('确认清除旧备份吗？将只保留最新备份。')) {
    return
  }
  backupLoading.value.cleanup = true
  try {
    const result = await request('backup/cleanup', 'DELETE')
    toastStore.showToast({
      content: `清理完成，删除 ${result.deleted?.length || 0} 个旧备份`,
      type: 'OK',
    })
  } catch (error) {
    toastStore.showToast({ content: '清理备份失败', type: '!' })
  } finally {
    backupLoading.value.cleanup = false
  }
}

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
          <HorizontalScroll class="actions">
            <Btn @click="create" :loading="loading.write">写文章</Btn>
            <Btn @click="goCategory">编辑分类</Btn>
            <Btn v-if="isAdmin" @click="goUserManage">管理用户</Btn>
            <Btn
              v-if="isAdmin"
              @click="triggerBackup"
              :loading="backupLoading.trigger"
            >
              触发备份
            </Btn>
            <Btn
              v-if="isAdmin"
              @click="downloadBackup"
              :loading="backupLoading.download"
            >
              下载备份
            </Btn>
            <Btn
              v-if="isAdmin"
              @click="cleanupBackups"
              :loading="backupLoading.cleanup"
            >
              清除备份
            </Btn>
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

.actions {
  display: flex;

  > *:not(:last-child) {
    margin-right: 1rem;
    flex: 0 0 auto;
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
