<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import io from 'socket.io-client'
import { ip } from '../config'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import Badge from '../components/Badge.vue'
import RecordTable from '../components/RecordTable.vue'
import Input from '../components/Input.vue'
import EditableInput from '../components/EditableInput.vue'
import { useToastStore } from '../store/toast'

type GomokuColor = 'black' | 'white'

const route = useRoute()
const router = useRouter()
const roomId = route.params.id as string
let userId = (route.params.userId as string) || ''
const toastStore = useToastStore()
let socket: any

const roomStatus = ref<'waiting' | 'playing' | 'settlement'>('waiting')
const users = ref<any[]>([])
const hostId = ref('')
const loading = ref(true)
const joinError = ref('')
const round = ref(0)
const currentPlayerId = ref('')
const blackUserId = ref('')
const whiteUserId = ref('')
const blackUserName = ref('')
const whiteUserName = ref('')
const boardSize = ref(15)
const board = ref<string[][]>([])
const records = ref<any[]>([])
const winnerId = ref('')
const winnerName = ref('')
const editingName = ref('')
const pendingMove = ref<{ x: number; y: number; color: GomokuColor } | null>(null)
const turnStartedAt = ref(0)
const lastMoveDurations = ref<Record<string, number>>({})
const boardViewportRef = ref<HTMLElement | null>(null)

const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const now = ref(Date.now())
const isPanning = ref(false)
const panStartX = ref(0)
const panStartY = ref(0)
const panOriginX = ref(0)
const panOriginY = ref(0)
const pointerDownTarget = ref<HTMLElement | null>(null)
const pointerDownX = ref(0)
const pointerDownY = ref(0)

let tickTimer: number | null = null
let boardResizeHandler: (() => void) | null = null
let boardFitFrame: number | null = null

const currentUid = () => (route.params.userId as string) || userId

const selfUser = computed(() => users.value.find(user => user.id === currentUid()))
const blackPlayer = computed(() => users.value.find(user => user.id === blackUserId.value))
const whitePlayer = computed(() => users.value.find(user => user.id === whiteUserId.value))
const gomokuPlayers = computed(() => [blackPlayer.value, whitePlayer.value].filter(Boolean))
const isHost = computed(() => hostId.value === currentUid())
const isActivePlayer = computed(() => currentPlayerId.value === currentUid())

watch(
  () => route.params.userId,
  value => {
    if (value) {
      userId = value as string
    }
  }
)

watch(
  () => selfUser.value?.name,
  name => {
    if (name) {
      editingName.value = name
    }
  },
  { immediate: true }
)

const fitBoardToViewport = () => {
  const viewport = boardViewportRef.value
  if (!viewport) return

  const boardPx = boardSize.value * 36
  const fitScale = Math.min(viewport.clientWidth, viewport.clientHeight) / boardPx
  const nextScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1

  scale.value = nextScale
  offsetX.value = (viewport.clientWidth - boardPx * nextScale) / 2
  offsetY.value = (viewport.clientHeight - boardPx * nextScale) / 2
}

const formatDuration = (ms: number) => {
  const safeMs = Math.max(0, Math.floor(ms || 0))
  const totalSeconds = Math.floor(safeMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const getPlayerThinkTime = (user: any) => {
  if (!user) return 0
  if (roomStatus.value === 'playing' && currentPlayerId.value === user.id && turnStartedAt.value) {
    return Math.max(0, now.value - turnStartedAt.value)
  }
  return lastMoveDurations.value[user.id] || 0
}

const boardCells = computed(() => {
  const cells: Array<{ x: number; y: number }> = []
  for (let y = 0; y < boardSize.value; y += 1) {
    for (let x = 0; x < boardSize.value; x += 1) {
      cells.push({ x, y })
    }
  }
  return cells
})

const transformStyle = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}))
const showBoard = computed(() => roomStatus.value !== 'waiting')

const scheduleBoardFit = () => {
  if (boardFitFrame !== null) {
    cancelAnimationFrame(boardFitFrame)
  }
  boardFitFrame = window.requestAnimationFrame(() => {
    boardFitFrame = null
    fitBoardToViewport()
  })
}

watch(
  () => [showBoard.value, boardSize.value],
  async () => {
    if (!showBoard.value) return
    await nextTick()
    scheduleBoardFit()
  },
  { immediate: true }
)

const syncRoomStatus = (data: any) => {
  loading.value = false
  roomStatus.value = data.status
  users.value = Array.isArray(data.users) ? data.users : []
  hostId.value = data.hostId || ''
  round.value = data.round || 0
  currentPlayerId.value = data.currentPlayerId || ''
  blackUserId.value = data.blackUserId || ''
  whiteUserId.value = data.whiteUserId || ''
  blackUserName.value = data.blackUserName || ''
  whiteUserName.value = data.whiteUserName || ''
  boardSize.value = data.boardSize || 15
  board.value = Array.isArray(data.board) ? data.board : []
  records.value = Array.isArray(data.records) ? data.records : []
  winnerId.value = data.winnerId || ''
  winnerName.value = data.winnerName || ''
  turnStartedAt.value = data.turnStartedAt || 0
  lastMoveDurations.value = data.lastMoveDurations || {}

  if (!editingName.value && selfUser.value?.name) {
    editingName.value = selfUser.value.name
  }
}

watch(
  () => [roomStatus.value, currentPlayerId.value],
  () => {
    if (roomStatus.value !== 'playing' || currentPlayerId.value !== currentUid()) {
      pendingMove.value = null
    }
  }
)

const setZoom = (delta: number, clientX?: number, clientY?: number) => {
  const viewport = boardViewportRef.value
  if (!viewport) return
  const rect = viewport.getBoundingClientRect()
  const nextScale = Math.min(2.2, Math.max(0.5, scale.value + delta))
  const anchorX = clientX ?? rect.left + rect.width / 2
  const anchorY = clientY ?? rect.top + rect.height / 2
  const localX = (anchorX - rect.left - offsetX.value) / scale.value
  const localY = (anchorY - rect.top - offsetY.value) / scale.value
  scale.value = nextScale
  offsetX.value = anchorX - rect.left - localX * nextScale
  offsetY.value = anchorY - rect.top - localY * nextScale
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  setZoom(event.deltaY < 0 ? 0.08 : -0.08, event.clientX, event.clientY)
}

const onPointerDown = (event: PointerEvent) => {
  pointerDownTarget.value = event.target as HTMLElement
  pointerDownX.value = event.clientX
  pointerDownY.value = event.clientY
  panStartX.value = event.clientX
  panStartY.value = event.clientY
  panOriginX.value = offsetX.value
  panOriginY.value = offsetY.value
  isPanning.value = false
  const currentTarget = event.currentTarget as HTMLElement | null
  currentTarget?.setPointerCapture?.(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (pointerDownTarget.value === null) return
  const distanceX = Math.abs(event.clientX - pointerDownX.value)
  const distanceY = Math.abs(event.clientY - pointerDownY.value)
  if (!isPanning.value && distanceX < 4 && distanceY < 4) return
  isPanning.value = true
  offsetX.value = panOriginX.value + (event.clientX - panStartX.value)
  offsetY.value = panOriginY.value + (event.clientY - panStartY.value)
}

const onPointerUp = (event: PointerEvent) => {
  const target = pointerDownTarget.value
  const wasPanning = isPanning.value
  pointerDownTarget.value = null
  isPanning.value = false

  if (wasPanning) {
    return
  }

  const cell = target?.closest?.('[data-x][data-y]') as HTMLElement | null
  if (!cell) return
  const x = Number(cell.dataset.x)
  const y = Number(cell.dataset.y)
  if (Number.isNaN(x) || Number.isNaN(y)) return
  placeStone(x, y)
}

const getCellStone = (x: number, y: number) => {
  return board.value?.[y]?.[x] || ''
}

const getStoneClass = (x: number, y: number) => {
  const stone = getCellStone(x, y)
  if (!stone) return ''
  return stone === 'black' ? 'stone black' : 'stone white'
}

const getPendingMoveClass = (x: number, y: number) => {
  if (!pendingMove.value || pendingMove.value.x !== x || pendingMove.value.y !== y) return ''
  return pendingMove.value.color === 'black' ? 'stone preview black' : 'stone preview white'
}

const getMoveLabel = (record: any) => `${record.round}回合`

const restartGame = () => {
  if (!isHost.value) return
  const confirmed = window.confirm('确定重启房间吗？这会清空所有对局数据并回到准备状态。')
  if (!confirmed) return
  socket.emit('restartGame', { roomId }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '重启失败', type: '!' })
    }
  })
}

const startGame = () => {
  if (users.value.length < 2) {
    toastStore.showToast({ content: '至少需要 2 名玩家开始游戏', type: '!' })
    return
  }
  socket.emit('startGame', { roomId }, wsErrorHandler)
}

const renameUser = (nextName?: string) => {
  const trimmedName = (nextName ?? editingName.value).trim()
  if (trimmedName.length < 1 || trimmedName.length > 16) {
    toastStore.showToast({ content: '名称需要1-16字符', type: '!' })
    return
  }
  const currentUser = selfUser.value
  if (!currentUser) return
  if (currentUser.name === trimmedName) {
    editingName.value = trimmedName
    return
  }
  socket.emit('renameUser', { userId: currentUser.id, newName: trimmedName }, (response: any) => {
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

const placeStone = (x: number, y: number) => {
  if (!isActivePlayer.value || roomStatus.value !== 'playing') return
  if (getCellStone(x, y)) return

  if (!pendingMove.value) {
    const color = selfUser.value?.color as GomokuColor | undefined
    if (color !== 'black' && color !== 'white') return
    pendingMove.value = { x, y, color }
    return
  }

  if (pendingMove.value.x !== x || pendingMove.value.y !== y) {
    const color = selfUser.value?.color as GomokuColor | undefined
    if (color !== 'black' && color !== 'white') return
    pendingMove.value = { x, y, color }
    return
  }

  socket.emit('placeStone', { x, y }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '落子失败', type: '!' })
      pendingMove.value = null
      return
    }
    pendingMove.value = null
  })
}

const setUserStatus = (status: 'ready' | 'end') => {
  const currentUser = selfUser.value
  if (!currentUser) return
  socket.emit('setUserStatus', { userId: currentUser.id, status }, (response: any) => {
    if (response?.success === false) {
      toastStore.showToast({ content: response.message || '状态更新失败', type: '!' })
    }
  })
}

const wsErrorHandler = (error: any) => {
  if (error?.success === false) {
    toastStore.showToast({ content: error.message || '操作失败', type: '!' })
    return
  }
}

const genRoomLabel = (id: string) => id.slice(0, 8)

onMounted(() => {
  if (!userId) {
    joinError.value = '缺少用户ID，请使用带用户ID的链接进入'
    loading.value = false
    return
  }

  const wsUrl = ip.replace('http://', 'ws://').replace('https://', 'wss://')
  socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 5000,
  })

  socket.on('connect_error', (error: any) => {
    if (loading.value) {
      loading.value = false
    }
    joinError.value = error?.message || '连接失败'
  })

  socket.on('connect', () => {
    const uid = (route.params.userId as string) || userId
    socket.emit('joinRoom', { roomId, userId: uid }, (resp: any) => {
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

  socket.on('syncRoomStatus', syncRoomStatus)
  socket.on('gameResult', (result: { winnerId: string, winnerName: string }) => {
    toastStore.showToast({ content: `${result.winnerName || '本局'}获胜`, type: 'OK' })
  })
  socket.on('roomClosed', (data: any) => {
    joinError.value = data?.message || '房间已关闭'
    loading.value = false
  })

  boardResizeHandler = () => {
    scheduleBoardFit()
  }
  window.addEventListener('resize', boardResizeHandler)

  now.value = Date.now()
  tickTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 500)
})

onUnmounted(() => {
  if (socket) {
    socket.disconnect()
  }
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  if (boardFitFrame !== null) {
    cancelAnimationFrame(boardFitFrame)
    boardFitFrame = null
  }
  if (boardResizeHandler) {
    window.removeEventListener('resize', boardResizeHandler)
    boardResizeHandler = null
  }
})
</script>

<template>
  <div class="gomoku-room-container">
    <div v-if="loading && !joinError" class="loading">
      <p>加载中...</p>
    </div>

    <div v-else-if="joinError" class="error">
      <p>{{ joinError }}</p>
    </div>

    <div v-else class="room-content">
      <div class="room-toolbar">
        <div class="room-title">五子棋</div>
        <div class="toolbar-actions">
          <Btn v-if="isHost" small type="danger" @click="restartGame">重启</Btn>
        </div>
      </div>

      <div class="players-list">
        <div
          v-for="user in users"
          :key="user.id"
          class="player-item"
          :class="{
            'current-player-is-me':
              roomStatus === 'playing' && currentPlayerId === user.id && user.id === currentUid(),
            'winner-player': roomStatus === 'settlement' && user.id === winnerId,
          }"
        >
          <div class="player-row">
            <div class="player-info">
              <div class="status-indicator" :class="user.connectStatus"></div>
              <EditableInput
                v-if="user.id === currentUid()"
                v-model="editingName"
                :maxLength="16"
                class="player-name editable"
                placeholder="请输入用户名"
                @submit="renameUser"
                @cancel="cancelEditName"
              />
              <span v-else class="player-name">{{ user.name }}</span>
              <Badge
                v-if="roomStatus === 'waiting' && user.id === hostId"
                color="#1890ff"
                text-color="white"
                text="房主"
              />
              <Badge v-if="user.id === currentUid()" color="#722ed1" text-color="white" text="我" />
              <Badge v-if="user.color === 'black'" color="var(--bg)" text-color="var(--text)">
                <template #default>
                  <div class="badge-icon black"></div>
                  黑棋
                </template>
              </Badge>
              <Badge v-if="user.color === 'white'" color="var(--bg)" text-color="var(--text)">
                <template #default>
                  <div class="badge-icon white"></div>
                  白棋
                </template>
              </Badge>
              <Badge
                v-if="roomStatus === 'playing' && currentPlayerId === user.id"
                color="#1890ff"
                text-color="white"
                type="loading"
                :text="`思考中 ${formatDuration(getPlayerThinkTime(user))}`"
              />
              <Badge
                v-if="user.readyStatus === 'ready'"
                color="#1890ff"
                text-color="white"
                text="已准备"
              />
              <Badge
                v-else-if="user.readyStatus === 'end'"
                color="#ff4d4f"
                text-color="white"
                text="不玩了"
              />
            </div>
            <div class="player-actions">
              <template v-if="user.id === currentUid()">
                <Btn
                  v-if="roomStatus === 'settlement'"
                  small
                  type="primary"
                  @click="setUserStatus('ready')"
                  >再来一局</Btn
                >
                <Btn
                  v-if="roomStatus === 'settlement'"
                  small
                  type="danger"
                  @click="setUserStatus('end')"
                  >不玩了</Btn
                >
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-if="roomStatus === 'waiting' && isHost" class="start-row">
        <Btn @click="startGame">{{
          users.length < 2 ? '至少需要 2 名玩家开始游戏' : '开始游戏'
        }}</Btn>
      </div>

      <template v-if="showBoard">
        <div class="board-shell">
          <div
            ref="boardViewportRef"
            class="board-viewport"
            @wheel.prevent="onWheel"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <div class="board-stage" :style="transformStyle">
              <div class="board-grid" :style="{ gridTemplateColumns: `repeat(${boardSize}, 36px)` }">
                <div
                  v-for="cell in boardCells"
                  :key="`${cell.x}-${cell.y}`"
                  class="board-cell"
                  :data-x="cell.x"
                  :data-y="cell.y"
                  :class="{
                    occupied: !!getCellStone(cell.x, cell.y),
                    preview: !!getPendingMoveClass(cell.x, cell.y),
                  }"
                >
                  <div v-if="getCellStone(cell.x, cell.y)" class="stone-wrap">
                    <div :class="getStoneClass(cell.x, cell.y)"></div>
                  </div>
                  <div v-else-if="getPendingMoveClass(cell.x, cell.y)" class="stone-wrap">
                    <div :class="getPendingMoveClass(cell.x, cell.y)"></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="board-zoom-controls" @pointerdown.stop @pointerup.stop>
              <Btn class="board-zoom-btn" small @click="fitBoardToViewport">适配</Btn>
            </div>
          </div>
        </div>

      </template>

      <Card v-if="gomokuPlayers.length">
        <template #title>对局记录</template>
        <RecordTable :players="gomokuPlayers" :records="records" />
      </Card>
    </div>
  </div>
</template>

<style lang="less" scoped>
.gomoku-room-container {
  padding: 6px 6px 60px;
  max-width: 920px;
  margin: 0 auto;
  .card {
    width: calc(100% - 1.5rem);
  }
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
  gap: 8px;
}

.room-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 4px 0;
}

.room-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.board-shell {
  position: relative;
  width: 100%;
  margin: 0 auto;
  aspect-ratio: 1 / 1;
}

.player-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.player-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}

.board-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #d8b06d;
  border-radius: 12px;
  margin: 0;
  touch-action: none;
  user-select: none;
}

.board-zoom-controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 2;
  display: flex;
  gap: 6px;
  backdrop-filter: blur(3px);
}

.board-zoom-btn {
  opacity: 0.85;
}

.timer-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.board-stage {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.board-grid {
  display: grid;
  gap: 0;
  width: fit-content;
  background: linear-gradient(to right, transparent 35px, rgba(0, 0, 0, 0.22) 36px),
    linear-gradient(to bottom, transparent 35px, rgba(0, 0, 0, 0.22) 36px);
  background-size: 36px 36px;
  background-color: #e6c37b;
  padding: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.board-cell {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.board-cell.preview {
  background: rgba(255, 255, 255, 0.16);
}

.stone-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stone {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);

  &.black {
    background: radial-gradient(circle at 35% 30%, #666, #111 68%);
  }

  &.white {
    background: radial-gradient(circle at 35% 30%, #fff, #f0f0f0 70%);
    border: 1px solid rgba(0, 0, 0, 0.15);
  }

  &.preview {
    opacity: 0.4;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.72), 0 2px 4px rgba(0, 0, 0, 0.18);
  }

  &.preview.black {
    border: 1px solid rgba(255, 255, 255, 0.5);
  }

  &.preview.white {
    border: 1px solid rgba(0, 0, 0, 0.5);
  }
}

.records-card,
.players-card,
.settings-card {
  width: 100%;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.record-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--quote-bg);
}

.record-round,
.record-winner {
  font-size: 13px;
}

.record-winner .check {
  color: #2ecc71;
  font-weight: 700;
}

.empty-records {
  color: var(--text-secondary);
  font-size: 13px;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .badge-icon {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    box-shadow: 0 0 20px 1px var(--text);
    color: var(--text);
    background: var(--bg);
    &.black {
      background: black;
    }
    &.white {
      background: white;
    }
  }
}

.player-item {
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--card-bg);
  &.current-player-is-me {
    border: 1px solid rgba(255, 217, 0, 0.6);
  }

  &.winner-player {
    border: 1px solid rgba(255, 77, 79, 0.95);
    box-shadow: 0 0 0 1px rgba(255, 77, 79, 0.18);
  }
}

.player-info {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

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
}

.start-row {
  display: flex;
  justify-content: center;
}

@media (max-width: 768px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .modal-setting-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
