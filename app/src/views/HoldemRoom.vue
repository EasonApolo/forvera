<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import io from 'socket.io-client'
import { ip } from '../config'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import Input from '../components/Input.vue'
import EditableInput from '../components/EditableInput.vue'
import { useToastStore } from '../store/toast'
import PokerCard from './Playground/holdem/PokerCard.vue'

const route = useRoute()
const router = useRouter()
const roomId = route.params.id as string
let userId = (route.params.userId as string) || '' // will ensure per-room id exists before connecting
const toastStore = useToastStore()
let socket: any

const roomStatus = ref<'waiting' | 'playing'>('waiting')
const users = ref<any[]>([])
const pendingUsers = ref<any[]>([])
const hostId = ref('')
const loading = ref(true)
const joinError = ref('')
const round = ref(1)
const smallBlind = ref(5)
const bigBlind = ref(10)
const currentPlayerId = ref('')
const dealerPosition = ref(0)
const communityCards = ref<any[]>([])
const gamePhase = ref<'preflop' | 'flop' | 'turn' | 'river' | 'showdown'>('preflop')
const winnerIds = ref<string[]>([])
const messages = ref<any[]>([])
const chatInput = ref('')
const chatVisible = ref(false)
const chatMessagesRef = ref<HTMLElement | null>(null)
const lastPreview = ref('')
let previewTimer: number | null = null
const results = ref<any[]>([])
const resultsVisible = ref(false)
const stats = ref<any>({ users: [] })
const statsVisible = ref(false)
const userActions = ref<Record<string, { action: string; amount?: number; totalAmount?: number; timestamp: number }>>({})
const chipActionPending = ref(false)
let chipActionPendingTimer: number | null = null

const clearChipActionPending = () => {
  chipActionPending.value = false
  if (chipActionPendingTimer) {
    clearTimeout(chipActionPendingTimer)
    chipActionPendingTimer = null
  }
}

const setChipActionPending = () => {
  clearChipActionPending()
  chipActionPending.value = true
  chipActionPendingTimer = window.setTimeout(() => {
    chipActionPending.value = false
    chipActionPendingTimer = null
    toastStore.showToast({ content: '网络较慢，已恢复操作，请再确认当前筹码状态', type: '!' })
  }, 5000)
}

const isActivePlayer = computed(() => {
  const uid = (route.params.userId as string) || userId
  return currentPlayerId.value === uid
})

const meUser = computed(() => {
  const uid = (route.params.userId as string) || userId
  return users.value.find(user => user.id === uid)
})

const selfUser = computed(() => {
  const uid = (route.params.userId as string) || userId
  return users.value.find(user => user.id === uid) || pendingUsers.value.find(user => user.id === uid)
})

// keep userId variable in sync if route param is added/changed
watch(
  () => route.params.userId,
  (v) => {
    if (v) {
      userId = v as string
    }
  }
)

const getUid = () => ((route.params.userId as string) || userId)

const showAdvancedButtons = ref(false)

const toggleAdvancedButtons = () => {
  showAdvancedButtons.value = !showAdvancedButtons.value
}

const gamePhaseText = computed(() => {
  switch (gamePhase.value) {
    case 'preflop':
      return '翻牌前下注'
    case 'flop':
      return '翻牌后下注'
    case 'turn':
      return '转牌后下注'
    case 'river':
      return '河牌后下注'
    case 'showdown':
      return '摊牌'
    default:
      return ''
  }
})

const getUserBetSum = (user: any) =>
  user.betChips.reduce(
    (sum: number, chip: { value: number; count: number }) => sum + chip.value * chip.count,
    0
  )

const hasBetChips = (user: any) =>
  Array.isArray(user?.betChips) && user.betChips.some((chip: { count: number }) => chip.count > 0)

const hasNewBet = (user: any) => {
  const betSum = getUserBetSum(user)
  return betSum > (user.betSum || 0)
}

const editingName = ref<string>('')
const lastSyncTimestamp = ref<number>(0)

watch(
  () => selfUser.value?.name,
  (name) => {
    if (name) {
      editingName.value = name
    }
  },
  { immediate: true }
)

const getResultPlayer = (result: any, targetUserId: string) => {
  return Array.isArray(result?.players)
    ? result.players.find((player: { userId: string }) => player.userId === targetUserId)
    : undefined
}

onMounted(() => {
  if (!userId) {
    joinError.value = '缺少用户ID，请使用带用户ID的链接进入'
    loading.value = false
    return
  }

  console.log('Room ID:', roomId)
  console.log('User ID:', userId)

  // 创建 WebSocket 连接（socket.io-client 2.x 版本的 API）
  const wsUrl = ip.replace('http://', 'ws://').replace('https://', 'wss://')
  socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket'], // 只使用 WebSocket 传输
    timeout: 5000, // 5秒超时
  })

  socket.on('connect_error', (error: any) => {
    if (loading.value) {
      loading.value = false
    }
    joinError.value = error?.message || '连接失败'
  })

  // 监听连接成功事件
  socket.on('connect', () => {
    const uid = (route.params.userId as string) || userId
    const joinData = {
      roomId,
      userId: uid,
    }
    socket.emit('joinRoom', joinData, (resp: any) => {
      if (resp && resp.success === false) {
        joinError.value = resp.message || '该用户已占用'
        loading.value = false
        toastStore.showToast({ content: joinError.value, type: '!' })
        socket.disconnect()
        return
      }
      loading.value = false
    })
  })

  const syncRoomStatus = (data: any) => {
    // 比较 timestamp，只有当新数据晚于已接收的数据时才更新
    if (data.timestamp < lastSyncTimestamp.value) {
      console.log('Ignoring outdated message:', data.timestamp, 'Last:', lastSyncTimestamp.value)
      return
    }
    lastSyncTimestamp.value = data.timestamp
    clearChipActionPending()

    if (loading.value) {
      loading.value = false
    }
    joinError.value = ''
    console.log('Room status synced:', data)
    communityCards.value = data.communityCards
    roomStatus.value = data.status
    hostId.value = data.hostId
    users.value = Array.isArray(data.users) ? data.users : []
    pendingUsers.value = Array.isArray(data.pendingUsers) ? data.pendingUsers : []
    currentPlayerId.value = data.currentPlayerId
    round.value = data.round
    winnerIds.value = data.winnerIds
    gamePhase.value = data.gamePhase
    if (Array.isArray(data.messages)) {
      messages.value = data.messages
    }
  }

  // 监听房间状态事件
  socket.on('syncRoomStatus', syncRoomStatus)

  // 监听游戏开始事件
  socket.on('gameStarted', (data: any) => {
    console.log('Game started:', data)
    roomStatus.value = data.status
    round.value = data.round
    users.value = data.users
    smallBlind.value = data.smallBlind
    bigBlind.value = data.bigBlind
    currentPlayerId.value = data.currentPlayerId
    dealerPosition.value = data.dealerPosition
    communityCards.value = data.communityCards
    gamePhase.value = data.gamePhase
    })

    // 监听当前玩家变更事件
    socket.on('currentPlayerChanged', (data: any) => {
    console.log('Current player changed:', data)
    currentPlayerId.value = data.currentPlayerId
    })

    // 监听新消息事件
    socket.on('newMessage', (data: any) => {
    console.log('New message received:', data)
    messages.value = [...messages.value, ...data]
    })

  // Keep messages array order as oldest -> newest; UI will auto-scroll via watcher

  // auto-scroll handled by watcher below

    // 监听同步结果事件
    socket.on('syncResults', (data: any) => {
    console.log('Results synced:', data)
    results.value = data
    })

    // 监听同步统计事件
    socket.on('syncStats', (data: any) => {
    console.log('Stats synced:', data)
    stats.value = data
    })

    // 监听同步用户状态事件
    socket.on('syncUserStatus', (data: any) => {
    console.log('User status synced:', data)
    // 更新用户的readyStatus
    users.value = users.value.map(user => {
      const statusData = data.find((d: any) => d.id === user.id)
      return statusData ? { ...user, readyStatus: statusData.readyStatus } : user
    })
    })

    // 监听用户动作事件
    socket.on('syncUserAction', (data: any) => {
    console.log('User action received:', data)
    handleUserAction(data)
    })

  // no catch needed; initialization errors should surface to Vue/error overlay during development
})

onUnmounted(() => {
  // 关闭 socket 连接
  if (socket) {
    console.log('Disconnecting WebSocket...')
    socket.disconnect()
  }
  if (previewTimer) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
})

// 开始游戏
const startGame = () => {
  socket.emit('startGame', { roomId })
}

const restartGame = () => {
  if (!confirm('确定会重启整局游戏。')) {
    return
  }
  socket.emit('restartGame', { roomId }, wsErrorHandler)
}

const quitBet = () => {
  const me = meUser.value || {}
  // Only prohibit fold for blinds during the initial preflop forced round
  if (
    (me.isSmallBlind && gamePhase.value === 'preflop' && (me.betSum || 0) < smallBlind.value) ||
    (me.isBigBlind && gamePhase.value === 'preflop' && (me.betSum || 0) < bigBlind.value)
  ) {
    toastStore.showToast({ content: '小盲和大盲在首轮不能弃牌', type: '!' })
    return
  }
  // 确认弃牌操作
  if (!confirm('确定要弃牌吗？')) {
    return
  }
  socket.emit('quitBet', {})
}

// 确认下注
const confirmBet = () => {
  socket.emit('confirmBet', {}, wsErrorHandler)
}

const takeBackBetChips = () => {
  socket.emit('takeBackBetChips', {}, wsErrorHandler)
}

// 梭哈
const allIn = () => {
  socket.emit('allIn', {})
}

// 找零
const exchangeToSmallChips = () => {
  socket.emit('exchangeToSmallChips', { userId: getUid() }, wsErrorHandler)
}

// 化整
const exchangeToLargeChips = () => {
  socket.emit('exchangeToLargeChips', { userId: getUid() }, wsErrorHandler)
}

// 贷款
const loan = () => {
  socket.emit('loan', { userId: getUid() }, wsErrorHandler)
}

// 还款
const repay = () => {
  socket.emit('repay', { userId: getUid() }, wsErrorHandler)
}

// 添加筹码到下注区
const addChip = (chipValue: number, userId: string) => {
  if (chipActionPending.value) return
  setChipActionPending()
  socket.emit('addChip', { chipValue, userId }, (response: any) => {
    clearChipActionPending()
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '加筹码失败', type: '!' })
    }
  })
}

// 从下注区移除筹码
const removeChip = (chipValue: number, userId: string) => {
  if (chipActionPending.value) return
  setChipActionPending()
  socket.emit('removeChip', { chipValue, userId }, (response: any) => {
    clearChipActionPending()
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '移除筹码失败', type: '!' })
    }
  })
}

// 发送消息
const sendMessage = () => {
  if (chatInput.value.trim()) {
    socket.emit('userSendMsg', { content: chatInput.value.trim() }, (response: any) => {
      if (response.error) {
        toastStore.showToast({ content: response.error, type: '!' })
      } else {
        chatInput.value = ''
      }
    })
  }
}

// 切换聊天框显示/隐藏
const toggleChat = () => {
  chatVisible.value = !chatVisible.value
  if (chatVisible.value) {
    // opened: scroll to bottom
    nextTick(() => {
      if (chatMessagesRef.value) {
        chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
      }
    })
    lastPreview.value = ''
    if (previewTimer) {
      clearTimeout(previewTimer)
      previewTimer = null
    }
  }
}

const wsErrorHandler = (error: any) => {
  if (error?.success === false) {
    toastStore.showToast({ content: error.message || '操作失败', type: '!' })
    return
  }
}

const finishEditName = (nextName?: string) => {
  const trimmedName = (nextName ?? editingName.value).trim()
  if (trimmedName.length < 1 || trimmedName.length > 16) {
    toastStore.showToast({ content: '名称需要1-16字符', type: '!' })
    return
  }
  const currentUser = selfUser.value
  if (!currentUser) {
    return
  }
  if (currentUser.name === trimmedName) {
    editingName.value = trimmedName
    return
  }
  socket.emit('updateUserName', {
    userId: currentUser.id,
    newName: trimmedName,
  }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '改名失败', type: '!' })
      editingName.value = currentUser.name
      return
    }
    editingName.value = trimmedName
  })
}

const cancelEditName = () => {
  editingName.value = selfUser.value?.name || ''
}

// 计算用户总收益
const getTotalProfit = (userId: string) => {
  return results.value.reduce((total, result) => {
    const player = result.players.find((p: any) => p.userId === userId)
    return total + (player?.profit || 0)
  }, 0)
}

// 设置用户状态（准备或结束）
const setUserStatus = (status: 'ready' | 'end') => {
  socket.emit('setUserStatus', { userId: getUid(), status }, wsErrorHandler)
}

// 处理用户动作
const handleUserAction = (actionData: any) => {
  const { userId, action, amount, totalAmount, timestamp } = actionData
  // 添加动作到用户动作记录
  userActions.value[userId] = { action, amount, totalAmount, timestamp }
  // 5秒后自动移除动作
  setTimeout(() => {
    if (userActions.value[userId]?.timestamp === timestamp) {
      delete userActions.value[userId]
    }
  }, 5000)
}

// watch messages for new items: auto-scroll or show preview when collapsed
watch(messages, (newVal, oldVal) => {
  if (!Array.isArray(newVal) || newVal.length === 0) return
  if (!oldVal || newVal.length <= oldVal.length) return
  const latest = newVal[newVal.length - 1]
  if (chatVisible.value) {
    nextTick(() => {
      if (chatMessagesRef.value) {
        chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
      }
    })
  } else {
    const name = latest?.userName || latest?.user || ''
    const text = latest?.content || latest?.message || ''
    lastPreview.value = name ? `${name}: ${text}` : text
    if (previewTimer) {
      clearTimeout(previewTimer)
    }
    previewTimer = window.setTimeout(() => {
      lastPreview.value = ''
      previewTimer = null
    }, 5000)
  }
})

// 获取动作文本
const getActionText = (action: string, amount?: number, totalAmount?: number) => {
  switch (action) {
    case 'fold':
      return '弃牌'
    case 'call':
      return '跟'
    case 'raise':
      return amount ? `加${amount}${totalAmount ? `，共${totalAmount}` : ''}` : '加'
    case 'all-in':
      return totalAmount ? `梭哈，共${totalAmount}` : '梭哈'
    default:
      return action
  }
}
</script>

<template>
  <div class="holdem-room-container">
    <div v-if="loading && !joinError" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="joinError" class="error">
      <p>{{ joinError }}</p>
    </div>

    <div v-else class="room-content">
      <div class="game-status">
        <template v-if="roomStatus === 'waiting'">
          <span>等待房主开始游戏...</span>
        </template>
        <template v-else>
          <span>回合:{{ round }}</span
          ><span class="divider">/</span>
          <span v-if="winnerIds?.length > 0"
            >获胜者:{{
              winnerIds.map(id => users.find(u => u.id === id)?.name || id).join(', ')
            }}</span
          >
          <span v-else-if="currentPlayerId === ''">
            已开牌，即将开始下一轮下注...
          </span>
          <span v-else>阶段:{{ gamePhaseText }}</span>
        </template>
        <div class="header-actions">
          <Btn v-if="userId === hostId" :small="true" type="danger" @click="restartGame">重启</Btn>
        </div>
      </div>
      <div class="community-cards" v-if="roomStatus === 'playing'">
        <div v-for="(card, index) in communityCards" :key="index" class="card-item">
          <PokerCard :card="card" :isFacedown="card.isFacedown"></PokerCard>
        </div>
      </div>

      <div class="users-list">
        <div
          v-for="user in users"
          :key="user.id"
          class="user-item"
          :class="{
            'current-player': isActivePlayer && currentPlayerId === user.id,
            'current-player-is-me': isActivePlayer && currentPlayerId === user.id,
            'all-in': user.isAllIn,
            'quit-bet': user.isQuitBet,
            'winner': roomStatus === 'playing' && currentPlayerId === '' && winnerIds.length > 0 && winnerIds.includes(user.id)
          }"
        >
          <!-- 第一行：用户名和标记 -->
          <div class="user-info">
            <div class="user-name-section">
              <div class="status-indicator" :class="user.connectStatus"></div>
              <EditableInput
                v-if="user.id === getUid()"
                v-model="editingName"
                :maxLength="16"
                class="user-name editable"
                placeholder="请输入用户名"
                @submit="finishEditName"
                @cancel="cancelEditName"
              />
              <span v-else class="user-name">{{ user.name }}</span>
              <span v-if="roomStatus === 'waiting' && user.id === hostId" class="host-badge"
                >房主</span
              >
              <span v-if="roomStatus === 'waiting' && user.id === userId" class="me-badge">我</span>
              <span
                v-if="roomStatus === 'playing' && user.isSmallBlind"
                class="blind-badge small-blind"
                >小盲</span
              >
              <span v-if="roomStatus === 'playing' && user.isBigBlind" class="blind-badge big-blind"
                >大盲</span
              >
              <span
                v-if="roomStatus === 'playing' && user.isAllIn"
                class="current-action-badge all-in"
                >梭哈</span
              >
              <span v-if="roomStatus === 'playing' && user.isQuitBet" class="current-action-badge"
                >弃牌</span
              >
              <span
                v-if="roomStatus === 'playing' && !user.isAsked && !user.isAllIn && !user.isQuitBet"
                class="current-action-badge"
                >待加注</span
              >
              <div
                v-if="roomStatus === 'playing' && currentPlayerId === user.id"
                class="thinking-badge"
              >
                <div class="thinking-icon"></div>
                <span class="thinking-text">思考中</span>
              </div>
              <!-- 用户准备状态 -->
              <span v-if="roomStatus === 'playing' && user.readyStatus === 'ready'" class="ready-status-badge ready">
                已准备
              </span>
              <span v-if="roomStatus === 'playing' && user.readyStatus === 'end'" class="ready-status-badge end">
                不玩了
              </span>
              <!-- 用户动作对话框 -->
              <div v-if="userActions[user.id]" class="user-action-bubble">
                <div class="bubble-arrow"></div>
                <div class="bubble-content">
                  {{
                    getActionText(
                      userActions[user.id].action,
                      userActions[user.id].amount,
                      userActions[user.id].totalAmount,
                    )
                  }}
                </div>
              </div>
              <!-- 获胜者badge -->
              <span v-if="roomStatus === 'playing' && currentPlayerId === '' && winnerIds.length > 0 && winnerIds.includes(user.id)" class="winner-badge">
                获胜
              </span>
            </div>
          </div>

          <!-- 第二行：筹码堆 -->
          <div v-if="roomStatus === 'playing'" class="chips-row">
            <!-- 左侧：自己的筹码堆 -->
            <div class="user-chips" v-if="user.chips">
              <div
                v-for="chip in user.chips"
                :key="chip.value"
                class="chip-item"
                :class="{
                  clickable: currentPlayerId === user.id && user.id === userId && chip.count > 0,
                  disabled: chipActionPending,
                }"
                @click="
                  currentPlayerId === user.id &&
                    user.id === userId &&
                    chip.count > 0 &&
                    !chipActionPending &&
                    addChip(chip.value, user.id)
                "
              >
                <div class="chip-stack">
                  <div
                    v-for="i in chip.count"
                    :key="i"
                    class="chip"
                    :class="`chip-value-${chip.value}`"
                  ></div>
                </div>
                <span class="chip-value">{{ chip.value }}</span>
              </div>
            </div>

            <div v-if="hasBetChips(user)" class="divider"></div>

            <!-- 右侧：回合内出的筹码堆 -->
            <div class="bet-chips" v-if="user.betChips">
              <div
                v-for="chip in user.betChips"
                :key="chip.value"
                class="chip-item"
                :class="{
                  clickable: currentPlayerId === user.id && user.id === userId && chip.count > 0,
                  disabled: chipActionPending,
                }"
                @click="
                  currentPlayerId === user.id &&
                    user.id === userId &&
                    chip.count > 0 &&
                    !chipActionPending &&
                    removeChip(chip.value, user.id)
                "
              >
                <div class="chip-stack">
                  <div
                    v-for="i in chip.count"
                    :key="i"
                    class="chip"
                    :class="`chip-value-${chip.value}`"
                  ></div>
                </div>
                <span class="chip-value">{{ chip.value }}</span>
              </div>
            </div>
          </div>

          <!-- 第三行：牌和确定按钮 -->
          <div
            v-if="roomStatus === 'playing' && (user.id === userId || gamePhase === 'showdown')"
            class="cards-action-row"
          >
            <!-- 左侧：牌 -->
            <div class="user-cards" v-if="user.cards">
              <div v-for="(card, index) in user.cards" :key="index" class="card-item">
                <PokerCard
                  :card="card"
                  :isFacedown="card.isFacedown || (user.id !== userId && gamePhase !== 'showdown')"
                ></PokerCard>
              </div>
            </div>

            <!-- 右侧：确定按钮 -->
            <div v-if="user.id === userId" class="action-button">
              <!-- 回合结算时显示准备和结束按钮（只有当有获胜者时才显示） -->
              <template v-if="roomStatus === 'playing' && currentPlayerId === '' && winnerIds.length > 0">
                <Btn :small="true" @click="setUserStatus('ready')" type="primary">再来一回合</Btn>
                <Btn :small="true" @click="setUserStatus('end')" type="danger">不玩了</Btn>
              </template>
              <!-- 正常游戏时显示操作按钮 -->
              <template v-else-if="isActivePlayer">
                <template v-if="showAdvancedButtons">
                  <Btn :small="true" @click="toggleAdvancedButtons">返回</Btn>
                  <div class="button-divider"></div>
                  <Btn :small="true" @click="exchangeToSmallChips">找零</Btn>
                  <Btn :small="true" @click="exchangeToLargeChips">化整</Btn>
                  <div class="button-divider"></div>
                  <Btn :small="true" @click="loan">贷款</Btn>
                  <Btn :small="true" @click="repay">还款</Btn>
                </template>
                <template v-else>
                  <Btn :small="true" @click="toggleAdvancedButtons">访问银行🏦</Btn>
                  <div class="button-divider"></div>
                  <Btn :small="true" v-if="hasNewBet(user)" @click="takeBackBetChips">拿回</Btn>
                  <Btn :small="true" @click="allIn">梭哈</Btn>
                  <div class="button-divider"></div>
                  <Btn :small="true" type="danger" @click="quitBet">弃牌</Btn>
                  <Btn :small="true" type="primary" @click="confirmBet">确认</Btn>
                </template>
              </template>
            </div>
          </div>
        </div>
        <div v-if="pendingUsers.length" class="pending-group">
          <div class="pending-title">等待中</div>
          <Card v-for="p in pendingUsers" :key="p.id" class="pending-card user-item pending-user">
            <div class="user-info">
              <div class="user-name-section">
                <EditableInput
                  v-if="p.id === getUid()"
                  v-model="editingName"
                  :maxLength="16"
                  class="user-name editable"
                  placeholder="请输入用户名"
                  @submit="finishEditName"
                  @cancel="cancelEditName"
                />
                <span v-else class="user-name">{{ p.name }}</span>
                <span v-if="p.id === userId" class="me-badge">我</span>
                <span class="pending-badge current-action-badge">等待中</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- 结果表格 -->
      <div v-if="results.length > 0 && roomStatus === 'playing' && currentPlayerId === '' && winnerIds.length > 0" class="results-container">
        <div class="results-header" @click="resultsVisible = !resultsVisible">
          <div class="results-toggle">
            {{ resultsVisible ? '−' : '+' }}
          </div>
          <div class="results-title">对局记录</div>
        </div>

        <div v-if="resultsVisible" class="results-table-container">
          <table class="results-table">
            <thead>
              <tr>
                <th>玩家</th>
                <th v-for="result in results" :key="result.round">
                  {{ result.round }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td class="player-name">{{ user.name }}</td>
                <td v-for="result in results" :key="result.round" class="profit-cell">
                  <span 
                    v-if="getResultPlayer(result, user.id)"
                    :class="{
                      'profit-positive': getResultPlayer(result, user.id)?.profit > 0,
                      'profit-negative': getResultPlayer(result, user.id)?.profit < 0
                    }"
                  >
                    {{ getResultPlayer(result, user.id)?.profit > 0 ? '+' : '' }}{{ getResultPlayer(result, user.id)?.profit || 0 }}
                  </span>
                  <span v-else>0</span>
                </td>
                <!-- <td class="total-profit">
                  <span 
                    :class="{
                      'profit-positive': getTotalProfit(user.id) > 0,
                      'profit-negative': getTotalProfit(user.id) < 0
                    }"
                  >
                    {{ getTotalProfit(user.id) > 0 ? '+' : '' }}{{ getTotalProfit(user.id) }}
                  </span>
                </td> -->
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 统计表格 -->
      <div v-if="stats.users.length > 0 && roomStatus === 'playing' && currentPlayerId === '' && winnerIds.length > 0" class="stats-container">
        <div class="stats-header" @click="statsVisible = !statsVisible">
          <div class="stats-toggle">
            {{ statsVisible ? '−' : '+' }}
          </div>
          <div class="stats-title">统计</div>
        </div>

        <div v-if="statsVisible" class="stats-table-container">
          <table class="stats-table">
            <thead>
              <tr>
                <th>玩家</th>
                <th>获胜次数</th>
                <th>最大赚</th>
                <th>最大亏</th>
                <th>all-in</th>
                <th>弃牌</th>
                <th>贷款</th>
                <th>同花顺</th>
                <th>四条</th>
                <th>葫芦</th>
                <th>同花</th>
                <th>顺子</th>
                <th>三条</th>
                <th>两对</th>
                <th>一对</th>
                <th>高牌</th>
                <th>当前总利润</th>
                <th>最高总利润</th>
                <th>最低总利润</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stat in stats.users" :key="stat.userId">
                <td class="player-name">{{ stat.userName }}</td>
                <td>{{ stat.winCount }}</td>
                <td>{{ stat.maxSingleWin > 0 ? '+' + stat.maxSingleWin : stat.maxSingleWin }}</td>
                <td>{{ stat.maxSingleLoss }}</td>
                <td>{{ stat.allInCount }}</td>
                <td>{{ stat.quitBetCount }}</td>
                <td>{{ stat.loanCount }}</td>
                <td>{{ stat.straightFlushCount }}</td>
                <td>{{ stat.fourOfKindCount }}</td>
                <td>{{ stat.fullHouseCount }}</td>
                <td>{{ stat.flushCount }}</td>
                <td>{{ stat.straightCount }}</td>
                <td>{{ stat.threeOfKindCount }}</td>
                <td>{{ stat.twoPairCount }}</td>
                <td>{{ stat.onePairCount }}</td>
                <td>{{ stat.highCardCount }}</td>
                <td>{{ stat.currentTotalProfit > 0 ? '+' + stat.currentTotalProfit : stat.currentTotalProfit }}</td>
                <td>{{ stat.highestTotalProfit > 0 ? '+' + stat.highestTotalProfit : stat.highestTotalProfit }}</td>
                <td>{{ stat.lowestTotalProfit }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="roomStatus === 'waiting' && userId === hostId" class="host-controls">
        <Btn @click="startGame" :disabled="users.length < 2">
          {{ users.length < 2 ? '至少需要 2 名玩家开始游戏' : '开始游戏' }}
        </Btn>
      </div>

      <!-- 聊天功能 -->
      <div class="chat-container">
        <div class="chat-header" @click="toggleChat">
          <div class="chat-toggle">
            {{ chatVisible ? '−' : '+' }}
          </div>
          <div class="chat-title">聊天
            <span class="chat-latest" v-if="lastPreview && !chatVisible">{{ lastPreview }}</span>
          </div>
        </div>

        <div v-if="chatVisible" class="chat-body">
          <div class="chat-messages" ref="chatMessagesRef">
            <div
              v-for="message in messages"
              :key="message.id"
              class="chat-message"
              :class="message.type"
            >
              <div class="message-content">
                <span v-if="message.type === 'chat'" class="message-username"
                  >{{ message.userName }}:</span
                >
                {{ message.content }}
              </div>
            </div>
          </div>

          <div class="chat-input-area">
            <Input
              v-model="chatInput"
              class="chat-input"
              placeholder="输入消息..."
              @keyup.enter="sendMessage"
            />
            <button class="chat-send-btn" :disabled="!chatInput.trim()" @click="sendMessage">
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.holdem-room-container {
  padding: 6px 6px 60px;
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  font-size: 24px;
  margin-bottom: 10px;
  text-align: center;
}

.room-id {
  text-align: center;
  margin-bottom: 30px;
  font-size: 16px;
  color: var(--text-secondary);
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  font-size: 16px;
}

.error {
  color: #ff4d4f;
}

.room-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  box-sizing: border-box;
  transition: margin-top 0.2s ease-out;
}

.status-card,
.users-card,
.table-card {
  padding: 20px;
  margin-bottom: 20px;
}

.round-info {
  margin-top: 10px;
  font-size: 16px;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.blind-info,
.phase-info {
  font-size: 14px;
}

.table-card {
  text-align: center;
}

.community-cards {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.users-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-item {
  display: flex;
  flex-direction: column;
  padding: 4px;
  background-color: var(--card-bg);
  border-radius: 6px;
  transition: all 0.3s ease;
  box-sizing: border-box;
}

.user-item.current-player {
  border: 1px solid var(--accent-color);
}
.user-item.current-player-is-me {
  box-shadow: var(--reply-shadow);
}

.user-item.all-in {
  background-color: rgba(255, 235, 59, 0.06);
}

.user-item.quit-bet {
  background-color: rgba(0,0,0,0.03);
}

.user-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  flex-wrap: wrap;
  gap: 8px;
}

.user-name-section {
  display: flex;
  align-items: center;
  row-gap: 4px;
  column-gap: 4px;
  flex-wrap: wrap;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-indicator.connected {
  background-color: #52c41a;
}

.status-indicator.disconnected {
  background-color: var(--border-light);
}

.user-name {
  font-weight: bold;
  font-size: 16px;
  cursor: default;
  border-radius: 2px;
  transition: all 0.2s ease;
}

.user-name.editable {
  cursor: pointer;
}

.user-name.editable:hover {
  background-color: var(--quote-bg);
}

.pending-group {
  margin-top: 8px;
}

.pending-title {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-align: left;
}

.pending-card {
  margin-bottom: 6px;
}

.pending-user {
  opacity: 0.96;
  box-shadow: var(--reply-shadow);
}

.pending-badge {
  font-size: 11px;
  color: white;
}

.user-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.host-badge,
.blind-badge,
.current-player-badge,
.current-action-badge,
.me-badge,
.thinking-badge {
  padding: 1px 4px;
  border-radius: 10px;
  font-size: 10px;
}

.host-badge {
  background-color: #1890ff;
  color: white;
}

.me-badge {
  background-color: #722ed1;
  color: white;
}

.blind-badge.small-blind {
  background-color: #52c41a;
  color: white;
}

.blind-badge.big-blind {
  background-color: #fa8c16;
  color: white;
}

.current-action-badge.all-in {
  background-color: rgb(255, 43, 43);
}

.current-player-badge {
  background-color: #ff4d4f;
  color: white;
}

.current-action-badge {
  background-color: #faad14;
  color: white;
}

.thinking-badge {
  background-color: #1890ff;
  color: white;
  display: inline-flex;
  align-items: center;

  .thinking-icon {
    width: 8px;
    height: 8px;
    border: 1px solid white;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 2px;
  }
}

.ready-status-badge {
  padding: 1px 4px;
  border-radius: 10px;
  font-size: 10px;
  color: white;

  &.ready {
    background-color: #52c41a;
  }

  &.end {
    background-color: #ff3f43;
  }
}

.user-action-bubble {
  position: relative;
  display: inline-block;
  margin-left: 8px;

    .bubble-content {
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
  }

  .bubble-arrow {
    position: absolute;
    left: -4px;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    border-right: 4px solid rgba(0, 0, 0, 0.8);
  }
}

.user-item.winner {
  border: 1px solid #ff4d4f;
  box-shadow: 0 4px 12px rgba(255, 77, 79, 0.06);
  background-color: rgba(255, 77, 79, 0.06);
}

.winner-badge {
  padding: 1px 4px;
  border-radius: 10px;
  font-size: 10px;
  color: white;
  background-color: #ff4d4f;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 筹码行 */
.chips-row {
  display: flex;
  justify-content: space-between;
  align-items: end;
  width: 100%;
  .divider {
    width: 1px;
    background-color: var(--border-light);
    margin: 8px 4px 0px;
    min-height: 12px;
    align-self: stretch;
  }
}

.user-chips,
.bet-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.chip-item {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: end;
  cursor: pointer;
  transition: all 0.2s ease;
  gap: 2px;
}

.chip-stack {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 1px;
}

.chip {
  height: 4px;
  border-radius: 2px;
  transition: all 0.2s ease;
}

/* 不同面值筹码的宽度 */
.chip-value-5 {
  width: 16px;
  background-color: #ffd700;
}

.chip-value-10 {
  width: 16px;
  background-color: #00bfff;
}

.chip-value-20 {
  width: 16px;
  background-color: #32cd32;
}

.chip-value-50 {
  width: 16px;
  background-color: #ff6347;
}

.chip-value-100 {
  width: 16px;
  background-color: #9370db;
}

.chip-value-200 {
  width: 16px;
  background-color: #ff69b4;
}

.chip-item:hover .chip {
  transform: scaleY(1.2);
}

.chip-item.clickable:hover .chip {
  opacity: 0.8;
}

.chip-value {
  font-weight: bold;
  font-size: 10px;
  line-height: 10px;
}

.chip-count {
  font-size: 10px;
  color: var(--text-secondary);
}

/* 牌和确定按钮行 */
.cards-action-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  width: 100%;
  margin-top: 4px;
}

.user-cards {
  display: flex;
  gap: 4px;
}

.community-cards .card-item,
.user-cards .card-item {
  perspective: 1000px;
}

.action-button {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.action-controls {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.host-controls {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

.game-status {
  text-align: center;
  font-size: 14px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .divider {
    color: var(--text-muted);
  }
}

/* 聊天功能样式 */
.chat-container {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  max-width: 600px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

.button-divider {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background-color: var(--border-light);
  align-self: center;
  flex-shrink: 0;
}

  .chat-header {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background-color: var(--quote-bg);
    cursor: pointer;
    transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--toc-toggle-bg);
    }

    .chat-toggle {
      font-size: 18px;
      font-weight: bold;
      margin-right: 8px;
      width: 20px;
      text-align: center;
    }

    .chat-title {
      font-size: 14px;
      font-weight: bold;
    }
  }

  .chat-latest {
    font-size: 13px;
    font-weight: normal;
    color: var(--text-muted);
    margin-left: 8px;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

.chat-body {
  display: flex;
  flex-direction: column;
  max-height: 200px; /* 大约5行的高度 */
}

  .chat-messages {
  flex: 1;
  padding: 8px;
  overflow-y: auto;
  background-color: rgba(var(--card-bg-rgb), 0.06);

  .chat-message {
    margin-bottom: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 14px;

    &.chat {
      background-color: var(--quote-bg);
      align-self: flex-start;
    }

    &.system {
      background-color: var(--quote-bg);
      align-self: center;
      font-style: italic;
      color: var(--text-secondary);
    }

    &:last-child {
      margin-bottom: 0;
    }

    .message-content {
      display: flex;
      align-items: center;
    }

    .message-username {
      font-weight: bold;
      margin-right: 6px;
      color: var(--accent-color);
    }
  }
}

.chat-input-area {
  display: flex;
  padding: 8px;
  background-color: var(--quote-bg);
  border-top: 1px solid var(--border-light);

  .chat-input {
    flex: 1;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 14px;
    outline: none;

    &:hover {
      border-color: var(--accent-color);
    }

    &:focus {
      border-color: var(--accent-color);
      box-shadow: none;
    }
  }

  .chat-send-btn {
    margin-left: 8px;
    padding: 6px 16px;
    background-color: var(--accent-color);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.2s ease;

    &:hover:not(:disabled) {
      opacity: 0.92;
    }

    &:disabled {
      background-color: var(--border-light);
      cursor: not-allowed;
    }
  }
}

/* 结果表格样式 */
.results-container {
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
}

.results-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--quote-bg);
  cursor: pointer;
  transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--toc-toggle-bg);
    }

  .results-toggle {
    font-size: 18px;
    font-weight: bold;
    margin-right: 8px;
    width: 20px;
    text-align: center;
  }

  .results-title {
    font-size: 14px;
    font-weight: bold;
  }
}

.results-table-container {
  overflow-x: auto;
  position: relative;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: max-content;

  th, td {
    padding: 8px 12px;
    text-align: center;
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
  }

  th {
    background-color: var(--card-bg);
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th:first-child,
  td:first-child {
    position: sticky;
    left: 0;
    background-color: var(--card-bg);
    z-index: 2;
  }

  th:first-child {
    background-color: var(--card-bg);
  }

  .player-name {
    font-weight: bold;
    text-align: left;
  }

  .profit-cell {
    font-family: monospace;
  }

  .total-profit {
    font-weight: bold;
    font-family: monospace;
  }

  .profit-positive {
    color: red;
  }

  .profit-negative {
    color: green;
  }

  tr:hover {
    background-color: var(--quote-bg);
  }

  tr:hover td:first-child {
    background-color: var(--quote-bg);
  }
}

/* 统计表格样式 */
.stats-container {
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
}

.stats-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background-color: var(--quote-bg);
  cursor: pointer;
  transition: background-color 0.2s ease;

    &:hover {
      background-color: var(--toc-toggle-bg);
    }

  .stats-toggle {
    font-size: 18px;
    font-weight: bold;
    margin-right: 8px;
    width: 20px;
    text-align: center;
  }

  .stats-title {
    font-size: 14px;
    font-weight: bold;
  }
}

.stats-table-container {
  overflow-x: auto;
  position: relative;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  min-width: max-content;

  th, td {
    padding: 8px 12px;
    text-align: center;
    border-bottom: 1px solid var(--border-light);
    white-space: nowrap;
  }

  th {
    background-color: var(--card-bg);
    font-weight: bold;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  th:first-child,
  td:first-child {
    position: sticky;
    left: 0;
    background-color: var(--card-bg);
    z-index: 2;
  }

  th:first-child {
    background-color: var(--card-bg);
  }

  .player-name {
    font-weight: bold;
    text-align: left;
  }

  tr:hover {
    background-color: var(--quote-bg);
  }

  tr:hover td:first-child {
    background-color: var(--quote-bg);
  }
}
</style>
