<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import GreyText from '../components/GreyText.vue'
import { useUserStore } from '../store/user'
import { useMainStore } from '../store/main'
import { request } from '../utils/request'
import { useToastStore } from '../store/toast'

type ManagedUser = {
  _id: string
  username?: string
  role?: number
}

const userStore = useUserStore()
const mainStore = useMainStore()
const toastStore = useToastStore()
const { userInfo } = storeToRefs(userStore)

const users = ref<ManagedUser[]>([])
const loading = ref(false)

const isAdmin = computed(() => Number(userInfo.value.role) === 3)
const sortedUsers = computed(() => {
  const currentId = `${userInfo.value._id || ''}`
  return [...users.value].sort((a, b) => {
    const aIsMe = `${a._id}` === currentId ? 0 : 1
    const bIsMe = `${b._id}` === currentId ? 0 : 1
    if (aIsMe !== bIsMe) return aIsMe - bIsMe
    return 0
  })
})

const loadUsers = async () => {
  if (!isAdmin.value) return
  loading.value = true
  try {
    const res = await request('user/list', 'POST')
    users.value = Array.isArray(res) ? res : []
  } finally {
    loading.value = false
  }
}

const isCurrentUser = (u: ManagedUser) => `${u._id}` === `${userInfo.value._id}`

const toggleAdmin = async (u: ManagedUser) => {
  if (isCurrentUser(u)) return
  const nextRole = Number(u.role) === 3 ? 1 : 3
  await request(`user/role/${u._id}`, 'PUT', JSON.stringify({ role: nextRole }))
  toastStore.showToast({ content: '权限已更新', type: 'OK' })
  await loadUsers()
}

const deleteUser = async (u: ManagedUser) => {
  if (isCurrentUser(u)) return
  const username = u.username || '未知用户'
  if (!confirm(`确认删除用户 ${username} 吗？该操作不可恢复。`)) {
    return
  }
  await request(`user/${u._id}`, 'DELETE')
  toastStore.showToast({ content: '用户已删除', type: 'OK' })
  await loadUsers()
}

onMounted(async () => {
  await userStore.getUserInfo()
  if (!isAdmin.value) {
    toastStore.showToast({ content: '仅管理员可访问', type: '!' })
    mainStore.go('/profile')
    return
  }
  await loadUsers()
})
</script>

<template>
  <List>
    <template #content>
      <div class="card-group">
        <GreyText>用户管理</GreyText>
        <Card class="item" v-if="loading">加载中...</Card>
        <Card class="item user-item" v-for="u in sortedUsers" :key="u._id">
          <div class="left">
            <div class="name">
              {{ u.username || '未知用户' }}
              <span v-if="isCurrentUser(u)" class="me-badge">me</span>
            </div>
            <div class="meta">ID: {{ u._id }}</div>
          </div>
          <div class="actions">
            <Btn
              :disabled="isCurrentUser(u)"
              :type="Number(u.role) === 3 ? 'primary' : undefined"
              @click="toggleAdmin(u)"
            >
              管理员
            </Btn>
            <Btn :disabled="isCurrentUser(u)" @click="deleteUser(u)">删除</Btn>
          </div>
        </Card>
      </div>
    </template>
  </List>
</template>

<style scoped lang="less">
.item {
  &:not(:first-child) {
    margin-top: 0.5rem;
  }
}

.user-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  .left {
    min-width: 0;
    text-align: left;

    .name {
      font-size: 14px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    .me-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 1rem;
      padding: 0 0.35rem;
      border-radius: 999px;
      font-size: 10px;
      line-height: 1;
      color: #fff;
      background: #2f6fed;
    }

    .meta {
      margin-top: 0.2rem;
      font-size: 12px;
      color: var(--text-secondary);
      word-break: break-all;
    }
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex: 0 0 auto;
  }
}
</style>
