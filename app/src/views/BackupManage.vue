<script setup lang="ts">
import { onMounted, ref } from 'vue'
import axios from 'axios'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import PageHeader from '../components/layout/PageHeader.vue'
import BottomNavBar from '../components/layout/BottomNavBar.vue'
import { useUserStore } from '../store/user'
import { useMainStore } from '../store/main'
import { useToastStore } from '../store/toast'
import { request } from '../utils/request'
import { ip as baseURL } from '../config'

const userStore = useUserStore()
const mainStore = useMainStore()
const toastStore = useToastStore()

const MAX_CHUNK_BYTES = 95 * 1024 * 1024

const backups = ref<Array<{ name: string; path: string; mtimeMs: number; size: number }>>([])
const loading = ref({ 
  list: false, 
  trigger: false, 
  restore: '',
})
const downloadProgress = ref<Record<string, { loaded: number; total: number; progress: number; speed: number }>>({})
const uploadProgress = ref<{ loaded: number; total: number; progress: number; speed: number } | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)

const formatBackupTime = (value?: number) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('zh-CN')
}

const fetchBackups = async () => {
  loading.value.list = true
  try {
    backups.value = await request('backup/list', 'GET')
  } catch (error) {
    backups.value = []
  } finally {
    loading.value.list = false
  }
}

const triggerBackup = async () => {
  if (userStore.userInfo.role !== 3) return
  const confirmed = window.confirm('确认触发备份吗？')
  if (!confirmed) return
  
  loading.value.trigger = true
  try {
    const result = await request('backup/trigger', 'POST')
    const timeText = result?.latest?.updatedAt
      ? formatBackupTime(new Date(result.latest.updatedAt).getTime())
      : '未知时间'
    toastStore.showToast({ content: `备份完成：${timeText}`, type: 'OK' })
    await fetchBackups()
  } catch (error) {
    toastStore.showToast({ content: '触发备份失败', type: '!' })
  } finally {
    loading.value.trigger = false
  }
}

const openUploadPicker = () => {
  if (userStore.userInfo.role !== 3) return
  if (uploadProgress.value) return
  uploadInput.value?.click()
}

const uploadBackup = async (event: Event) => {
  if (userStore.userInfo.role !== 3) return
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!file.name.toLowerCase().endsWith('.zip')) {
    toastStore.showToast({ content: '仅支持上传 .zip 备份文件', type: '!' })
    return
  }

  try {
    uploadProgress.value = { loaded: 0, total: file.size, progress: 0, speed: 0 }
    const totalChunks = Math.max(1, Math.ceil(file.size / MAX_CHUNK_BYTES))
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    let lastTime = Date.now()
    let lastLoaded = 0
    let lastSpeed = 0

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * MAX_CHUNK_BYTES
      const end = Math.min(start + MAX_CHUNK_BYTES, file.size)
      const chunk = file.slice(start, end)
      const formData = new FormData()
      formData.append('chunk', chunk, file.name)
      formData.append('uploadId', uploadId)
      formData.append('chunkIndex', String(chunkIndex))
      formData.append('totalChunks', String(totalChunks))
      formData.append('fileName', file.name)

      await axios.post(`${baseURL}api/backup/upload/chunk`, formData, {
        withCredentials: true,
        headers: userStore.userInfo.token
          ? { Authorization: userStore.userInfo.token }
          : undefined,
        onUploadProgress: (progressEvent) => {
          const loadedInChunk = progressEvent.loaded || 0
          const overallLoaded = Math.min(start + loadedInChunk, file.size)
          const total = file.size
          const progress = total > 0 ? (overallLoaded / total) * 100 : 0

          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          if (elapsed >= 0.3) {
            lastSpeed = (overallLoaded - lastLoaded) / elapsed
            lastTime = now
            lastLoaded = overallLoaded
          }

          uploadProgress.value = { loaded: overallLoaded, total, progress, speed: lastSpeed }
        },
      })

      const chunkLoaded = Math.min(end, file.size)
      const now = Date.now()
      const elapsed = (now - lastTime) / 1000
      if (elapsed >= 0.3) {
        lastSpeed = (chunkLoaded - lastLoaded) / elapsed
        lastTime = now
        lastLoaded = chunkLoaded
      }
      uploadProgress.value = { loaded: chunkLoaded, total: file.size, progress: (chunkLoaded / file.size) * 100, speed: lastSpeed }
    }

    toastStore.showToast({ content: '备份上传完成', type: 'OK' })
    await fetchBackups()
  } catch (error) {
    toastStore.showToast({ content: '上传备份失败', type: '!' })
  } finally {
    uploadProgress.value = null
  }
}

const downloadBackup = async (name: string) => {
  if (userStore.userInfo.role !== 3) return

  const knownTotal = backups.value.find(b => b.name === name)?.size || 0
  const totalChunks = Math.max(1, Math.ceil(knownTotal / MAX_CHUNK_BYTES))

  try {
    downloadProgress.value[name] = { loaded: 0, total: knownTotal, progress: 0, speed: 0 }

    let lastTime = Date.now()
    let lastLoaded = 0
    let lastSpeed = 0

    const picker = (window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description?: string; accept: Record<string, string[]> }>
      }) => Promise<{ createWritable: () => Promise<{ write: (data: Uint8Array) => Promise<void>; close: () => Promise<void> }> }>
    }).showSaveFilePicker

    if (!picker) {
      if (knownTotal > MAX_CHUNK_BYTES) {
        throw new Error('当前浏览器不支持大文件分块下载，请使用支持 File System Access API 的 Chromium 浏览器')
      }

      const res = await axios.get(`${baseURL}api/backup/${encodeURIComponent(name)}`, {
        responseType: 'blob',
        withCredentials: true,
        headers: userStore.userInfo.token
          ? { Authorization: userStore.userInfo.token }
          : undefined,
      })
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
      toastStore.showToast({ content: '备份下载完成', type: 'OK' })
      return
    }

    const handle = await picker({
      suggestedName: name,
      types: [{ description: 'Zip Backup', accept: { 'application/zip': ['.zip'] } }],
    })
    const writable = await handle.createWritable()

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * MAX_CHUNK_BYTES
      const end = Math.min(start + MAX_CHUNK_BYTES - 1, Math.max(knownTotal - 1, 0))

      const res = await axios.get(`${baseURL}api/backup/${encodeURIComponent(name)}`, {
        responseType: 'arraybuffer',
        withCredentials: true,
        headers: {
          ...(userStore.userInfo.token ? { Authorization: userStore.userInfo.token } : undefined),
          Range: `bytes=${start}-${end}`,
        },
        onDownloadProgress: (progressEvent) => {
          const loadedInChunk = progressEvent.loaded || 0
          const overallLoaded = Math.min(start + loadedInChunk, knownTotal)
          const progress = knownTotal > 0 ? (overallLoaded / knownTotal) * 100 : 0

          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          if (elapsed >= 0.3) {
            lastSpeed = (overallLoaded - lastLoaded) / elapsed
            lastTime = now
            lastLoaded = overallLoaded
          }

          downloadProgress.value[name] = { loaded: overallLoaded, total: knownTotal, progress, speed: lastSpeed }
        },
      })

      await writable.write(new Uint8Array(res.data))
      const overallLoaded = Math.min(start + (end - start + 1), knownTotal)
      downloadProgress.value[name] = {
        loaded: overallLoaded,
        total: knownTotal,
        progress: knownTotal > 0 ? (overallLoaded / knownTotal) * 100 : 0,
        speed: lastSpeed,
      }
    }

    await writable.close()
    toastStore.showToast({ content: '备份下载完成', type: 'OK' })
  } catch (error) {
    toastStore.showToast({ content: '下载备份失败', type: '!' })
  } finally {
    delete downloadProgress.value[name]
  }
}

const restoreBackup = async (name: string) => {
  if (userStore.userInfo.role !== 3) return
  const confirmed = window.confirm(`确认恢复备份 ${name} 吗？\n\n警告：这将覆盖当前所有数据（数据库和资产文件）！`)
  if (!confirmed) return
  
  loading.value.restore = name
  try {
    await request(`backup/restore/${encodeURIComponent(name)}`, 'POST')
    toastStore.showToast({ content: '备份已恢复', type: 'OK' })
    // Optionally reload the page to refresh data
    setTimeout(() => {
      window.location.reload()
    }, 1500)
  } catch (error) {
    toastStore.showToast({ content: '恢复备份失败', type: '!' })
  } finally {
    loading.value.restore = ''
  }
}

const deleteBackup = async (name: string) => {
  if (userStore.userInfo.role !== 3) return
  const confirmed = window.confirm(`确认删除备份 ${name} 吗？`)
  if (!confirmed) return
  
  try {
    await request(`backup/${encodeURIComponent(name)}`, 'DELETE')
    toastStore.showToast({ content: '备份已删除', type: 'OK' })
    await fetchBackups()
  } catch (error) {
    toastStore.showToast({ content: '删除备份失败', type: '!' })
  }
}

const goBack = () => {
  mainStore.router.back()
}

const navItems = [
  { key: 'back', label: '‹ 返回' },
]

const handleNavSelect = (key: string) => {
  if (key === 'back') {
    goBack()
  }
}

onMounted(() => {
  void fetchBackups()
})
</script>

<template>
  <List>
    <template #content>
      <PageHeader>
        <template #left>
          <div class="title">备份管理</div>
        </template>
        <template #right>
          <Btn small @click="fetchBackups" :loading="loading.list">刷新</Btn>
          <Btn
            v-if="userStore.userInfo.role === 3"
            small
            @click="openUploadPicker"
            :downloadProgress="uploadProgress?.progress"
            :downloadLoaded="uploadProgress?.loaded"
            :downloadTotal="uploadProgress?.total"
            :downloadSpeed="uploadProgress?.speed"
          >上传备份</Btn>
          <Btn v-if="userStore.userInfo.role === 3" small type="primary" @click="triggerBackup" :loading="loading.trigger">触发备份</Btn>
          <input
            ref="uploadInput"
            type="file"
            accept=".zip"
            class="upload-input"
            @change="uploadBackup"
          />
        </template>
      </PageHeader>

      <div v-if="loading.list" class="empty-card">正在加载备份列表…</div>
      <div v-else-if="!backups.length" class="empty-card">暂无备份文件</div>
      <template v-else>
        <Card v-for="backup in backups" :key="backup.name" class="backup-item">
          <div class="backup-main">
            <div class="backup-name">{{ backup.name }}</div>
            <div class="backup-time">{{ formatBackupTime(backup.mtimeMs) }}</div>
          </div>
          <div class="backup-actions">
            <Btn 
              size="small" 
              @click="restoreBackup(backup.name)" 
              :loading="loading.restore === backup.name"
            >恢复</Btn>
            <Btn 
              size="small" 
              @click="downloadBackup(backup.name)" 
              :downloadProgress="downloadProgress[backup.name]?.progress"
              :downloadLoaded="downloadProgress[backup.name]?.loaded"
              :downloadTotal="downloadProgress[backup.name]?.total"
              :downloadSpeed="downloadProgress[backup.name]?.speed"
            >下载</Btn>
            <Btn 
              size="small" 
              type="danger" 
              @click="deleteBackup(backup.name)"
            >删除</Btn>
          </div>
        </Card>
      </template>

      <BottomNavBar :items="navItems" @select="handleNavSelect" />
    </template>
  </List>
</template>

<style scoped lang="less">
.upload-input {
  display: none;
}

.empty-card {
  padding: 1rem;
  color: var(--text-secondary);
}

.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.backup-main {
  min-width: 0;
  flex: 1;
  text-align: left;
}

.backup-name {
  font-weight: 600;
  word-break: break-all;
}

.backup-time {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.backup-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}
</style>
