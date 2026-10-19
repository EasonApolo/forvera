<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, provide, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import io, { Socket } from 'socket.io-client'
import { ip } from '../../config'
import Btn from '../../components/Btn.vue'
import Badge from '../../components/Badge.vue'
import Modal from '../../components/Modal.vue'
import Input from '../../components/Input.vue'
import Checkbox from '../../components/Checkbox.vue'
import EditableInput from '../../components/EditableInput.vue'
import { useToastStore } from '../../store/toast'
import List from '@/components/layout/List.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { IGameRoom, IGameUser, WsCustomMsg, WsCustomMsgName, WsEventMsg } from 'shared/types/game'
import { ReliableEngine, ReliablePacket } from 'shared/reliableEngine'
import StepperFilter from '@/components/StepperFilter.vue'
import DrawGuess from './games/drawguess/main.ts'
import Gomoku from './games/gomoku/main.ts'
import Xiangqi from './games/xiangqi/main.ts'
import Checkers from './games/checkers/main.ts'
import Holdem from './games/holdem/main.ts'
import Table from '@/components/Table.vue'
import { create2DArray } from 'shared/utils.ts'
import Card from '@/components/Card.vue'
import CircleBtn from '@/components/CircleBtn.vue'

// ==================== 基础 ====================

const route = useRoute()
const router = useRouter()
const toastStore = useToastStore()

// ==================== 房间和用户 ====================

const roomId = route.params.id as string
const userId = computed(() => (route.params.userId as string) || '')
const room = reactive<IGameRoom>({
  id: roomId,
  status: 'waiting',
  hostId: '',
  gameKey: 'drawguess',
  users: reactive({}),
  userOrder: [],
  turn: 0,
  turnStatus: 'before',
  round: 0,
  roundStatus: 'before',
  startTime: 0,
  duration: 0,
  roundResults: [],
  allowUndo: false,
})
const userList = computed(() => {
  return room.userOrder.map(uid => room.users[uid])
})
const me = computed(() => room.users[userId.value] || null)
const isHost = computed(() => room.hostId === userId.value)
const isMeActing = computed(() => {
  return (
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    // turn 已结束（after）无法操作，不再显示流线；before 仍保留提示即将轮到谁
    room.turnStatus !== 'after' &&
    selectedGame.value?.imActing?.({ room, userId: userId.value, ws })
  )
})
const joinError = ref('')

function startGame() {
  selectedGame.value?.setup?.({ room, userId: userId.value, ws })
  socket?.emit('startGame', { roomId: room.id, userId: userId.value }, wsErrorHandler)
}
function endGame() {
  socket?.emit('endGame', { roomId: room.id }, wsErrorHandler)
}
function setUserStatus(status: 'ready' | 'end') {
  socket?.emit('setUserStatus', { userId: userId.value, status }, wsErrorHandler)
}

// ==================== 棋类认输（五子棋/象棋，房间字段同构） ====================

const showResignConfirm = ref(false)
const canResignBoardGame = (targetUserId: string) => {
  const boardRoom = room as any
  return (
    (selectedGameKey.value === 'gomoku' || selectedGameKey.value === 'xiangqi') &&
    targetUserId === userId.value &&
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    !boardRoom.winnerId &&
    !boardRoom.isDraw &&
    (boardRoom.blackUserId === userId.value || boardRoom.whiteUserId === userId.value)
  )
}
const confirmResign = () => {
  showResignConfirm.value = false
  // 游戏内消息必须走可靠消息通道（ws 包装），裸 socket.emit 服务端没有对应监听
  emit('resign', undefined)
}

const showUndoConfirm = ref(false)
const canUndoGomoku = (targetUserId: string) => {
  const gomokuRoom = room as any
  return (
    selectedGameKey.value === 'gomoku' &&
    targetUserId === userId.value &&
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    // 房主需在设置里开启「允许悔棋」
    room.allowUndo &&
    !gomokuRoom.winnerId &&
    !gomokuRoom.isDraw &&
    // 只能撤回最近一手（自己下的），且此刻已轮到别人；悔过后不可连续悔
    !!gomokuRoom.lastMove &&
    gomokuRoom.lastMoveUserId === userId.value &&
    gomokuRoom.currentPlayerId !== userId.value
  )
}
const confirmUndo = () => {
  showUndoConfirm.value = false
  emit('undo', undefined)
}
function restartGame() {
  if (!confirm('确定重启房间吗？')) return
  socket?.emit('restartGame', { roomId: room.id }, wsErrorHandler)
}
function clearRoundResults() {
  if (!confirm('确定清除对局记录吗？')) return
  socket?.emit('clearRoundResults', { roomId: room.id }, wsErrorHandler)
}
function updateAllowUndo(value: boolean) {
  socket?.emit('updateGameSettings', { roomId: room.id, allowUndo: value }, wsErrorHandler)
}
function onSyncRoom(newData: IGameRoom) {
  if (!newData) return

  for (const key in newData) {
    if (key === 'users') {
      // 合并用户数据
      for (const [userId, newUserData] of Object.entries(newData.users)) {
        if (!room.users[userId]) {
          room.users[userId] = reactive(newUserData)
        } else {
          Object.assign(room.users[userId], newUserData)
        }
      }
    } else {
      // sync 的 key 集合是动态的（各游戏附加字段），走 any 索引赋值
      ;(room as any)[key] = (newData as any)[key]
    }
  }
}

// ==================== WebSocket ====================

let socket: Socket | null = null
let reliable = new ReliableEngine<any>()
let customMsgReliable = new ReliableEngine<WsCustomMsg>()
const reliableWrappedHandlers = new Map<
  string,
  Map<(data: any) => void, (msg: WsEventMsg) => void>
>()
// socket 建立前（子组件 onMounted 早于父组件 connect）注册的处理器，等 socket 就绪后补挂
const pendingSocketHandlers: Array<{ type: string; wrapped: (msg: WsEventMsg) => void }> = []

function createIncomingReliableEngine() {
  reliable = new ReliableEngine<any>({
    gapTimeoutMs: 1200,
    onGapTimeout: ({ expectedSeq, highestSeq }) => {
      seqGaps.value += Math.max(0, highestSeq - expectedSeq + 1)
      socket?.emit('requestResend', { fromSeq: expectedSeq, toSeq: highestSeq })
    },
  })
}

function createOutgoingReliableEngine() {
  customMsgReliable = new ReliableEngine<WsCustomMsg>()
}

function emit(type: string, data: any) {
  const packet = customMsgReliable.createOutgoingPacket({ type, data })
  socket?.emit(WsCustomMsgName, packet)
}
function on(type: string, callback: (data: any) => void) {
  const wrapped = (msg: WsEventMsg) => {
    const packet = msg as unknown as ReliablePacket<any>
    reliable.consumeIncomingPacket(packet, delivered => {
      trackSeq(delivered.seq)
      callback(delivered.data)
    })
  }
  if (!reliableWrappedHandlers.has(type)) {
    reliableWrappedHandlers.set(type, new Map())
  }
  reliableWrappedHandlers.get(type)!.set(callback, wrapped)
  if (socket) {
    socket.on(type, wrapped)
  } else {
    // socket 未建立（子组件 onMounted 早于父组件 connect）：暂存，setupHandlers 里补挂
    pendingSocketHandlers.push({ type, wrapped })
  }
}
function off(type: string, callback?: (data: any) => void) {
  const detach = (wrapped: (msg: WsEventMsg) => void) => {
    if (socket) socket.off(type, wrapped)
    const pendingIndex = pendingSocketHandlers.findIndex(h => h.type === type && h.wrapped === wrapped)
    if (pendingIndex >= 0) pendingSocketHandlers.splice(pendingIndex, 1)
  }
  if (!callback) {
    const callbackMap = reliableWrappedHandlers.get(type)
    if (callbackMap) {
      for (const wrapped of callbackMap.values()) {
        detach(wrapped)
      }
      callbackMap.clear()
    }
    return
  }
  const wrapped = reliableWrappedHandlers.get(type)?.get(callback)
  if (!wrapped) return
  detach(wrapped)
  reliableWrappedHandlers.get(type)!.delete(callback)
}
const ws = { emit, on, off } as any as WebSocket
const wsErrorHandler = (resp: any) => {
  if (resp?.success === false) {
    toastStore.showToast({ content: resp.message || '操作失败', type: '!' })
  }
}

function connect() {
  const base = ip.replace('http://', 'ws://').replace('https://', 'wss://')
  const wsUrl = base + 'game'
  socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 5000,
    query: { roomId: roomId.value, userId: userId.value },
  })
  setupHandlers()
}

function setupHandlers() {
  if (!socket) return

  // 补挂 socket 建立前注册的处理器（子组件 onMounted 早于父组件 connect）
  for (const { type, wrapped } of pendingSocketHandlers.splice(0)) {
    socket.on(type, wrapped)
  }

  socket.on('connect', () => {
    connected.value = true
    createIncomingReliableEngine()
    createOutgoingReliableEngine()
    lastSeq.value = 0
    seqGaps.value = 0
    socket!.emit('joinRoom', { roomId: roomId, userId: userId.value }, (resp: any) => {
      if (resp?.success === false) {
        joinError.value = resp.message || '加入房间失败'
        toastStore.showToast({ content: joinError.value, type: '!' })
        socket!.disconnect()
      }
    })
  })

  socket.on('disconnect', () => {
    connected.value = false
  })

  socket.on('connect_error', (error: any) => {
    connected.value = false
    joinError.value = error?.message || '连接失败'
  })

  on('syncRoom', data => {
    onSyncRoom(data as IGameRoom)
  })

  socket.on('ackClientMessage', (payload: { seq: number }) => {
    if (!Number.isFinite(payload?.seq)) return
    customMsgReliable.ack(Math.floor(payload.seq))
  })

  socket.on('requestClientResend', (payload: { fromSeq: number; toSeq?: number }) => {
    const fromSeq = Math.max(1, Math.floor(payload?.fromSeq || 1))
    const toSeq = Number.isFinite(payload?.toSeq) ? Math.floor(payload.toSeq as number) : undefined
    const packets = customMsgReliable.getOutgoingRange(fromSeq, toSeq)
    for (const packet of packets) {
      socket?.emit(WsCustomMsgName, { ...packet, t: Date.now() })
    }
  })

  on('message', GameMsg => {
    addMessage(GameMsg)
  })

  on('roomClosed', () => {
    joinError.value = '房间已关闭'
    toastStore.showToast({ content: '房间已被关闭', type: '!' })
  })

  // 被管理员踢出：提示并退出房间页
  on('kicked', () => {
    toastStore.showToast({ content: '你已被移出房间', type: '!' })
    router.push({ name: 'playground' })
  })

  // 其他玩家被踢：从本地房间状态移除（sync 只合并不删除，需要显式处理）
  on('userKicked', ({ userId }: { userId: string }) => {
    const name = room.users[userId]?.name
    delete room.users[userId]
    room.userOrder = room.userOrder.filter((id: string) => id !== userId)
    if (name) {
      addMessage({
        id: `system-${Date.now()}`,
        type: 'system',
        content: `${name} 被移出了房间`,
      })
    }
  })

  // 延迟 / 丢包：定时 ping，用 ack 计算 RTT。
  // pingTimer = window.setInterval(() => {
  //   if (!socket?.connected) return
  //   const t = Date.now()
  //   socket.timeout(4000).emit('ping', { t }, (err: any, resp: any) => {
  //     if (err || !resp) pushPing(false)
  //     else {
  //       latency.value = Date.now() - t
  //       pushPing(true)
  //     }
  //   })
  // }, 2000)
}

// ==================== 游戏选择 ====================

export interface GameOptionHookParams {
  room: IGameRoom
  userId: string
  ws: WebSocket
}
export interface GameOptions {
  gameinfo?: any
  main?: any
  customBadges?: any
  customChatMsg?: any
  /** 玩家卡内容区（渲染在玩家信息行下方，接收 room/user/userId/socket） */
  playerBody?: any
  setup?: (params: GameOptionHookParams) => void
  imActing?: (params: GameOptionHookParams) => boolean
  /** 自定义对局记录表格（如德扑按 profit 展示）；返回 null 表示不显示 */
  formatRoundResults?: (room: IGameRoom) => { rows: string[]; cols: string[]; data: any[][] } | null
}

const gameList = [
  {
    key: 'drawguess',
    name: '你画我猜',
    options: DrawGuess,
  },
  {
    key: 'gomoku',
    name: '五子棋',
    options: Gomoku,
  },
  {
    key: 'xiangqi',
    name: '象棋',
    options: Xiangqi,
  },
  {
    key: 'checkers',
    name: '跳棋',
    options: Checkers,
  },
  {
    key: 'holdem',
    name: '德扑',
    options: Holdem,
  },
]
// 准备界面仅房主可切换游戏（其他人显示游戏名，跟随房主的选择）
const allowChangeGame = computed(() => room.status === 'waiting' && isHost.value)
const selectedGameName = ref(gameList[0].name)
const selectedGameKey = computed(() => gameList.find(g => g.name === selectedGameName.value)?.key || gameList[0].key)
const selectedGameItem = computed(() => gameList.find(g => g.key === selectedGameKey.value))
const selectedGame = computed(() => {
  const gameOptions = gameList.find(g => g.key === selectedGameKey.value)?.options
  return gameOptions || null
})
watch(() => room.gameKey, (key) => {
  const entry = gameList.find(g => g.key === key)
  if (entry) selectedGameName.value = entry.name
}, { immediate: true })
watch(selectedGameName, (name) => {
  const entry = gameList.find(g => g.name === name)
  if (!entry || entry.key === room.gameKey) return
  if (isHost.value && socket) {
    socket.emit('setGame', { gameKey: entry.key }, wsErrorHandler)
  }
})

// ==================== 改名 ====================

const editingName = ref('')
watch(me, newValue => {
  editingName.value = newValue.name
})

function renameUser() {
  const trimmed = editingName.value.trim()
  if (trimmed.length < 1 || trimmed.length > 16) {
    toastStore.showToast({ content: '名称需要1-16字符', type: '!' })
    return
  }
  socket?.emit('renameUser', { userId: userId.value, newName: trimmed }, wsErrorHandler)
}
function cancelEditName() {
  editingName.value = me.value?.name || ''
}

// ==================== 设置 ====================

const showSettings = ref(false)
const settings = ref<Record<string, unknown>>({})

// ==================== 网络状态 ====================

let pingTimer: number | null = null
const showNetModal = ref(false)
const showNetStats = ref(true)
const connected = ref(false)
const latency = ref(0)
const recentPings = ref<boolean[]>([]) // true=收到 pong, false=超时
const lastSeq = ref(0)
const seqGaps = ref(0)

const lossPercent = computed(() => {
  if (!recentPings.value.length) return 0
  const lost = recentPings.value.filter(ok => !ok).length
  return Math.round((lost / recentPings.value.length) * 100)
})

function trackSeq(seq: number) {
  if (!Number.isFinite(seq)) return
  if (lastSeq.value === 0) {
    lastSeq.value = seq
  } else if (seq === lastSeq.value + 1) {
    lastSeq.value = seq
  } else if (seq > lastSeq.value + 1) {
    seqGaps.value += seq - lastSeq.value - 1
    lastSeq.value = seq
  }
  // 收到即确认（消息确认）。
  socket?.emit('ackMessage', { seq })
}

function pushPing(ok: boolean) {
  recentPings.value.push(ok)
  if (recentPings.value.length > 20) recentPings.value.shift()
}

// ==================== 聊天 ====================

interface ChatMessage {
  id: number | string
  type: 'chat' | 'system'
  userName?: string
  content: string
}

const chatConfig = reactive({
  title: '聊天',
  visible: true,
  canSend: true,
})
const messages = ref<ChatMessage[]>([])
const chatText = ref('')
const chatMessagesRef = ref<HTMLElement | null>(null)
const isChatAtBottom = ref(true)

watch(
  () => chatConfig.visible,
  () => {
    if (chatConfig.visible) {
      scrollToBottom()
    }
  }
)
const onChatScroll = () => {
  if (!chatMessagesRef.value) return
  const el = chatMessagesRef.value
  isChatAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 10
}
function onClickToBottom() {
  scrollToBottom()
}
function autoScrollToBottom() {
  console.log('autoScrollToBottom', isChatAtBottom.value, chatConfig.visible)
  if (!isChatAtBottom.value) { return }
  scrollToBottom()
}
function scrollToBottom() {
  nextTick(() => {
    if (chatMessagesRef.value) {
      chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
    }
  })
}
function sendMessage() {
  const text = chatText.value.trim()
  if (!text) return
  socket?.emit('sendMessage', { text }, wsErrorHandler)
  chatText.value = ''
}
function setChatTitle(title?: string) {
  chatConfig.title = title || '聊天'
}
function toggleChat(value?: boolean | MouseEvent) {
  if (typeof value === 'boolean') {
    chatConfig.visible = value
  } else {
    chatConfig.visible = !chatConfig.visible
  }
}
function clearMessages() {
  messages.value = []
}
function toggleCanSend(value?: boolean | MouseEvent) {
  if (typeof value === 'boolean') {
    chatConfig.canSend = value
  } else {
    chatConfig.canSend = !chatConfig.canSend
  }
}
function addMessage(newMsg: ChatMessage) {
  messages.value.push(newMsg)
  if (messages.value.length > 200) messages.value.splice(0, messages.value.length - 200)
  autoScrollToBottom()
}
provide('GameChat', {
  clearMessages,
  setChatTitle,
  sendMessage,
  toggleChat,
  toggleCanSend,
  addMessage,
})

// ==================== 对局结果 ====================
const roundResultsData = reactive({
  show: false,
  rows: [] as string[],
  cols: [] as string[],
  data: [] as any[][],
})
watch(
  () => room.roundResults,
  (newVal, oldVal) => {
    const latestRound = newVal.at(-1)
    if (!latestRound) return
    // 游戏可自定义对局记录表格（默认显示每局获胜 ✓）
    const formatted = selectedGame.value?.formatRoundResults?.(room)
    if (formatted) {
      roundResultsData.show = true
      roundResultsData.rows = formatted.rows
      roundResultsData.cols = formatted.cols
      roundResultsData.data = formatted.data
      return
    }
    const userIds = room.userOrder || []
    const roundIds = newVal.map(r => r.round)
    const data = create2DArray(userIds.length, roundIds.length, '')
    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]
      for (let j = 0; j < newVal.length; j++) {
        const roundResult = newVal[j]
        if (roundResult && roundResult.users && roundResult.users[userId] !== undefined) {
          if (roundResult.users[userId].isWinner) {
            // 并列第一（不止一个赢家）时全部显示 🤝
            const winnerCount = Object.values(roundResult.users).filter((r: any) => r.isWinner).length
            data[i][j] = winnerCount > 1 ? '🤝' : '✓'
          }
        }
      }
    }
    roundResultsData.show = true
    roundResultsData.rows = userIds.map(uid => room.users[uid]?.name || uid)
    roundResultsData.cols = roundIds.map(rid => `第 ${rid} 局`)
    roundResultsData.data = data
  },
  { immediate: true }
)

// ==================== lifecycles ====================

onMounted(() => {
  connect()
})

onUnmounted(() => {
  socket?.disconnect()
  if (pingTimer !== null) window.clearInterval(pingTimer)
})
</script>

<template>
  <List>
    <template #content>
      <div v-if="joinError" class="gt-center gt-error">{{ joinError }}</div>

      <div v-else class="game-view">
        <!-- 顶部：左上游戏名+状态，右上设置 -->
        <PageHeader class="top-bar">
          <template #left>
            <div>
              <StepperFilter
                v-if="allowChangeGame"
                v-model:value="selectedGameName"
                :options="gameList.map(g => g.name)"
                :loop="true"
                :nullable="false"
              />
              <span v-else class="game-name">{{ selectedGameItem?.name || '你画我猜' }}</span>
            </div>
            <!-- {{ room.roundStatus }} / {{ room.turnStatus }} -->
            <component :is="selectedGame?.gameinfo" v-if="selectedGame?.gameinfo" :room="room" />
          </template>
          <template #right>
            <!-- <span
              v-if="showNetStats"
              class="net-display"
              :class="{ off: !connected }"
              @click.stop="showNetModal = true"
              style="cursor: pointer"
            >
              {{ latency }}ms · PL:{{ lossPercent }}%<template v-if="seqGaps">
                · 缺口 {{ seqGaps }}</template
              >
            </span> -->
            <Btn small @click="showSettings = true">设置</Btn>
            <Btn v-if="isHost && room.status === 'playing'" small type="danger" @click="restartGame"
              >重启</Btn
            >
          </template>
        </PageHeader>

        <!-- 玩家列表（与其它游戏一致） -->
        <div class="players-list">
          <div
            v-for="user of userList"
            :key="user.id"
            class="player-item"
            :class="{ 'current-player-is-me': isMeActing && user.id === userId }"
          >
            <div class="player-row">
              <div class="player-info">
                <div class="status-indicator" :class="user.connectStatus"></div>
                <EditableInput
                  v-if="user.id === userId"
                  v-model="editingName"
                  :maxLength="16"
                  class="player-name editable"
                  placeholder="请输入用户名"
                  @submit="renameUser"
                  @cancel="cancelEditName"
                />
                <span v-else class="player-name">{{ user.name }}</span>
                <Badge
                  v-if="room.status === 'waiting' && user.id === room.hostId"
                  color="#1890ff"
                  text-color="white"
                  text="房主"
                />
                <Badge v-if="user.id === userId" color="#722ed1" text-color="white" text="我" />
                <component
                  :is="selectedGame?.customBadges"
                  :room="room as any"
                  :user="user as any"
                  :userId="userId"
                  :socket="socket"
                />
                <Badge
                  v-if="room.roundStatus === 'after' && user.readyStatus === 'ready'"
                  color="var(--primary-color)"
                  text-color="white"
                  text="已准备"
                />
                <Badge
                  v-else-if="room.roundStatus === 'after' && user.readyStatus === 'end'"
                  color="#ff4d4f"
                  text-color="white"
                  text="不玩了"
                />
              </div>
              <div class="player-actions">
                <Btn
                  v-if="canUndoGomoku(user.id)"
                  small
                  @click="showUndoConfirm = true"
                >悔棋</Btn>
                <Btn
                  v-if="canResignBoardGame(user.id)"
                  small
                  type="danger"
                  @click="showResignConfirm = true"
                >认输</Btn>
                <Btn
                  v-if="room.roundStatus === 'after' && user.id === userId"
                  small
                  type="primary"
                  @click="setUserStatus('ready')"
                  >再来一局</Btn
                >
                <Btn
                  v-if="room.roundStatus === 'after' && user.id === userId"
                  small
                  type="danger"
                  @click="setUserStatus('end')"
                >
                  不玩了</Btn
                >
              </div>
            </div>
            <!-- 游戏自定义的玩家卡内容区（如德扑的筹码/手牌/操作按钮） -->
            <component
              :is="selectedGame?.playerBody"
              v-if="selectedGame?.playerBody"
              :room="room as any"
              :user="user as any"
              :userId="userId"
              :socket="ws"
            />
          </div>
        </div>

        <!-- 房主控制 -->
        <div v-if="room.status === 'waiting' && isHost" class="start-btn">
          <Btn type="primary" @click="startGame">开始游戏</Btn>
          <Btn v-if="room.roundResults.length" @click="clearRoundResults">清除对局记录</Btn>
        </div>

        <component
          :is="selectedGame?.main"
          v-if="selectedGame?.main"
          :room="room"
          :userId="userId"
          :socket="ws"
        ></component>

        <!-- 对局记录 -->
        <Card v-if="room.roundStatus === 'after'">
          <template #title>对局记录</template>
          <Table
            v-if="roundResultsData.show"
            :rows="roundResultsData.rows"
            :cols="roundResultsData.cols"
            :content="roundResultsData.data"
          ></Table>
        </Card>

        <!-- 聊天 -->
        <div class="chat-container">
          <div class="chat-header" @click="toggleChat">
            <div class="chat-toggle">
              {{ chatConfig.visible ? '−' : '+' }}
            </div>
            <div class="chat-title">
              {{ chatConfig.title }}
            </div>
          </div>

          <div v-if="chatConfig.visible" class="chat-body">
            <div class="chat-messages" ref="chatMessagesRef" @scroll="onChatScroll">
              <CircleBtn
                v-if="!isChatAtBottom"
                class="to-top"
                :size="24"
                icon="chevron-down"
                @click="onClickToBottom"
              ></CircleBtn>
              <template v-if="!messages.length">
                <div class="chat-empty">暂无消息</div>
              </template>
              <template v-else>
                <TransitionGroup name="slide-right" tag="div" class="message-list">
                  <template v-for="message in messages" :key="message.id">
                    <div v-if="message.type === 'chat'" class="chat-message chat">
                      <div class="username">{{ message.userName }}:</div>
                      <div class="content">{{ message.content }}</div>
                    </div>
                    <div v-else-if="message.type === 'system'" class="chat-message system">
                      {{ message.content }}
                    </div>
                    <component
                      class="chat-message"
                      v-else
                      :is="selectedGame?.customChatMsg"
                      :msg="message"
                    ></component>
                  </template>
                </TransitionGroup>
              </template>
            </div>

            <div v-if="chatConfig.canSend" class="chat-input-area">
              <Input
                v-model="chatText"
                class="chat-input"
                placeholder="输入..."
                @enter="sendMessage"
              />
              <Btn class="chat-send-btn" type="primary" :disabled="!chatText.trim()" @click="sendMessage">
                发送
              </Btn>
            </div>
          </div>
        </div>
      </div>

      <!-- 设置面板 -->
      <Modal v-model:show="showSettings" title="设置" :hide-footer="true">
        <div class="item">
          <div class="label">显示网络状态（延迟 / 丢包）</div>
          <Checkbox v-model="showNetStats" :size="14" />
        </div>
        <div v-if="isHost" class="item">
          <div class="label">允许悔棋（五子棋）</div>
          <Checkbox
            :model-value="!!room.allowUndo"
            :size="14"
            @update:model-value="(value: any) => updateAllowUndo(!!value)"
          />
        </div>
      </Modal>

      <!-- 网络详情面板 -->
      <Modal v-model:show="showNetModal" title="网络状态" :hide-footer="true">
        <div class="item">
          <div class="label">连接</div>
          <div class="value">{{ connected ? '已连接' : '已断开' }}</div>
        </div>
        <div class="item">
          <div class="label">延迟 RTT</div>
          <div class="value">{{ latency }} ms</div>
        </div>
        <div class="item">
          <div class="label">丢包率</div>
          <div class="value">{{ lossPercent }} %</div>
        </div>
        <div class="item">
          <div class="label">当前 seq</div>
          <div class="value">{{ lastSeq }}</div>
        </div>
        <div class="item">
          <div class="label">缺口</div>
          <div class="value">{{ seqGaps }}</div>
        </div>
        <div class="item">
          <div class="label">最近 Ping</div>
          <div class="value">
            <span
              v-for="(ok, idx) in recentPings"
              :key="idx"
              :class="['ping-dot', ok ? 'ok' : 'bad']"
            ></span>
          </div>
        </div>
      </Modal>
      <Modal
        :show="showResignConfirm"
        title="认输"
        @cancel="showResignConfirm = false"
        @confirm="confirmResign"
      >
        确定认输吗？本局将由对手获胜。
      </Modal>
      <Modal
        :show="showUndoConfirm"
        title="悔棋"
        @cancel="showUndoConfirm = false"
        @confirm="confirmUndo"
      >
        确定悔棋吗？将撤回最后一手，由该手玩家重新落子。
      </Modal>
    </template>
  </List>
</template>

<style scoped lang="less">
.game-view {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .top-bar {
    margin-bottom: 0;

    .game-name {
      font-weight: bold;
    }

    .game-status {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .net-display {
      font-size: 12px;
      color: var(--text-secondary);
      font-variant-numeric: tabular-nums;

      &.off {
        color: var(--text-disabled);
      }
    }
  }

  /* 玩家列表：与五子棋 / 你画我猜一致 */
  .players-list {
    display: flex;
    flex-direction: column;
    gap: 6px;

    .player-item {
      position: relative;
      padding: 6px 8px;
      border-radius: 8px;
      background: var(--card-bg);
      box-sizing: border-box;
      border: 1px solid transparent;

      // 轮到自己行动时：流线绕边框旋转（颜色随主题，App.vue 的 --flow-color）
      &.current-player-is-me::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        padding: 1px;
        background: conic-gradient(
          from var(--flow-angle),
          rgba(var(--flow-color), 0.15) 0turn,
          rgba(var(--flow-color), 0.15) 0.72turn,
          rgba(var(--flow-color), 0.95) 0.88turn,
          rgba(var(--flow-color), 0.15) 1turn
        );
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        mask-composite: exclude;
        animation: flowBorderSpin 3.2s linear infinite;
        pointer-events: none;
      }

      .player-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex-wrap: wrap;

        .player-info {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;

          .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;

            &.connected {
              background-color: #52c41a;
            }

            &.disconnected {
              background-color: var(--border-light);
            }
          }

          .player-name {
            font-weight: 600;
            font-size: 13px;
            color: var(--text);
          }
        }

        .player-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
          flex-wrap: wrap;
        }
      }
    }
  }

  .start-btn {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
}

// ====================  ====================

.ping-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.ping-dot.ok {
  background: #52c41a;
}

.ping-dot.bad {
  background: #ff4d4f;
}

/* chat */
.chat-container {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 1rem);
  max-width: 600px;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--card-bg);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;

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
      margin-right: 6px;
      width: 20px;
      text-align: center;
    }

    .chat-title {
      font-size: 14px;
      font-weight: bold;

      .chat-latest {
        font-size: 13px;
        font-weight: normal;
        color: var(--text-secondary);
        margin-left: 8px;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .chat-body {
    display: flex;
    flex-direction: column;
    max-height: 200px;

    .chat-messages {
      flex: 1;
      padding: 8px;
      overflow-y: auto;
      background-color: rgba(var(--card-bg-rgb), 0.06);
      overflow-x: hidden;

      .chat-empty {
        text-align: left;
        color: var(--text-secondary);
        font-size: 12px;
        margin-left: 1px;
      }

      .to-top {
        position: absolute;
        bottom: 60px;
        right: 12px;
        opacity: 0.7;
        z-index: 10;
        box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      }

      .message-list {
        position: relative;
      }

      .chat-message {
        margin-bottom: 8px;
        padding: 6px 10px;
        border-radius: 4px;
        font-size: 14px;
        display: flex;
        align-self: flex-start;

        &.chat,
        &.system {
          background-color: var(--quote-bg);
        }

        &.chat {
        }

        &.system {
          background-color: var(--quote-bg);
          align-self: flex-start;
          font-style: italic;
          color: var(--text-secondary);
        }

        &:last-child {
          margin-bottom: 0;
        }

        .content {
          display: flex;
          align-items: center;
        }

        .username {
          font-weight: bold;
          margin-right: 6px;
          color: var(--primary-color);
        }
      }

      .slide-right-enter-active {
        transition: all 0.35s cubic-bezier(0.25, 1, 0.5, 1);
      }

      .slide-right-enter-from {
        opacity: 0;
        transform: translateX(30px) translateY(2px);
      }

      .slide-right-enter-to {
        opacity: 1;
        transform: translateX(0) translateY(0);
      }

      .slide-right-leave-active {
        transition: all 0.2s ease;
      }
      .slide-right-leave-to {
        opacity: 0;
      }
    }

    .chat-input-area {
      display: flex;
      padding: 0 8px 8px;
      align-items: baseline;

      // 只管布局；边框/内边距由 Input 组件自身样式负责（class 落在组件根 wrapper 上）
      .chat-input {
        flex: 1;
        min-width: 0;
      }

      // 只管布局；外观由 Btn 组件负责
      .chat-send-btn {
        margin-left: 8px;
        flex: 0 0 auto;
      }
    }
  }
}

@property --flow-angle {
  syntax: '<angle>';
  initial-value: 0turn;
  inherits: false;
}

@keyframes flowBorderSpin {
  to {
    --flow-angle: 1turn;
  }
}
</style>
