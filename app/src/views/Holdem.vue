<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '../store/user'
import { storeToRefs } from 'pinia'
import { request } from '../utils/request'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import GreyText from '../components/GreyText.vue'

const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)

type RoomItem = {
  id: string
  status: 'waiting' | 'playing'
  gamePhase: string
  userCount: number
  connectedCount: number
  hostId: string
  round: number
  messageCount: number
}

const rooms = ref<RoomItem[]>([])
const loading = ref(false)
const closingRoomId = ref('')
const isAdmin = computed(() => userInfo.value.role === 3)

const fetchRooms = async () => {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const res = await request('holdem/rooms', 'GET')
    rooms.value = Array.isArray(res?.rooms) ? res.rooms : []
  } finally {
    loading.value = false
  }
}

const createRoom = async () => {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const res = await request('holdem/rooms', 'POST')
    if (res?.roomId) {
      await fetchRooms()
    }
  } finally {
    loading.value = false
  }
}

const genShareUserId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

const copyLink = async (roomId: string) => {
  const shareUserId = genShareUserId()
  const link = `${window.location.origin}/holdem/${roomId}/${shareUserId}`
  try {
    await navigator.clipboard.writeText(link)
    alert('已复制分享链接: ' + link)
  } catch (e) {
    console.error('copy failed', e)
    alert('复制分享链接失败，请手动复制: ' + link)
  }
}

const closeRoom = async (roomId: string) => {
  if (!isAdmin.value) return
  if (!confirm(`确认关闭房间 ${roomId} 吗？`)) return
  closingRoomId.value = roomId
  try {
    await request(`holdem/rooms/${roomId}`, 'DELETE')
    await fetchRooms()
  } finally {
    closingRoomId.value = ''
  }
}

onMounted(async () => {
  await userStore.getUserInfo()
  if (isAdmin.value) {
    await fetchRooms()
  }
})
</script>

<template>
  <div class="holdem-container">
      <Card v-if="isAdmin" class="admin-panel">
        <div class="header-row">
          <GreyText>房间列表（管理员）</GreyText>
          <div style="display:flex;gap:8px;align-items:center">
            <Btn small @click="fetchRooms" :loading="loading">刷新</Btn>
            <Btn small type="primary" @click="createRoom">创建房间</Btn>
          </div>
        </div>

        <div v-if="loading" class="empty">加载中...</div>
        <div v-else-if="!rooms.length" class="empty">暂无房间</div>

        <div v-else class="room-list">
          <div v-for="room in rooms" :key="room.id" class="room-item">
            <div class="room-main">
              <div class="room-id">{{ room.id }}</div>
              <div class="meta">
                <span>状态：{{ room.status }}</span>
                <span>阶段：{{ room.gamePhase }}</span>
                <span>人数：{{ room.connectedCount }}/{{ room.userCount }}</span>
                <span>回合：{{ room.round }}</span>
                <span>消息：{{ room.messageCount }}</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <Btn small @click="copyLink(room.id)">分享</Btn>
              <Btn
                type="danger"
                small
                :loading="closingRoomId === room.id"
                @click="closeRoom(room.id)"
              >
                关闭
              </Btn>
            </div>
          </div>
        </div>
      </Card>
  </div>
</template>

<style lang="less" scoped>
.holdem-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: left;
}

h2 {
  font-size: 24px;
  margin-bottom: 20px;
}


p {
  font-size: 16px;
  color: var(--text-secondary);
}


.info-text {
  margin-top: 20px;
  padding: 10px;
  background-color: var(--quote-bg);
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);

    code {
    display: inline;
    background-color: var(--code-bg);
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
  }
}

.admin-panel {
  width: 100%;
  max-width: 720px;

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .empty {
    text-align: left;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .room-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .room-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
  }

  .room-main {
    flex: 1;
    min-width: 0;
    text-align: left;
  }

  .room-id {
    font-weight: 600;
    font-size: 14px;
    color: var(--text);
    word-break: break-all;
  }

  .meta {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    font-size: 12px;
    color: var(--text-secondary);
  }
}
</style>
