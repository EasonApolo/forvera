<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { request } from '../utils/request'
import { useUserStore } from '../store/user'
import { useToastStore } from '../store/toast'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import GreyText from '../components/GreyText.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import List from '@/components/layout/List.vue'

const router = useRouter()
const userStore = useUserStore()
const toastStore = useToastStore()
const { userInfo } = storeToRefs(userStore)

type RoomItem = {
	id: string
	status: 'waiting' | 'playing'
	userCount: number
	connectedCount: number
	hostId: string
	round: number
	winnerName: string
	recordsCount: number
	users: Array<{
		id: string
		name: string
		connectStatus: 'connected' | 'disconnected'
	}>
}

const rooms = ref<RoomItem[]>([])
const loading = ref(false)
const closingRoomId = ref('')
const isAdmin = computed(() => userInfo.value.role === 3)
let autoRefreshTimer: number | null = null

const fetchRooms = async ({ silent }: { silent?: boolean } = {}) => {
	if (!isAdmin.value) return
	if (!silent) {
		loading.value = true
	}
	try {
		const res = await request('gomoku/rooms', 'GET')
		rooms.value = Array.isArray(res?.rooms) ? res.rooms : []
	} finally {
		if (!silent) {
			loading.value = false
		}
	}
}

const createRoom = async () => {
	if (!isAdmin.value) return
	loading.value = true
	try {
		const res = await request('gomoku/rooms', 'POST')
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

const copyLink = async (roomId: string, shareUserId: string) => {
	const link = `${window.location.origin}/gomoku/${roomId}/${shareUserId}`
	try {
		await navigator.clipboard.writeText(link)
		toastStore.showToast({ content: '已复制分享链接', type: 'OK' })
	} catch (e) {
		console.error('copy failed', e)
		toastStore.showToast({ content: '复制失败，请检查剪贴板权限', type: '!' })
	}
}

const copyRoomLink = async (roomId: string) => {
	await copyLink(roomId, genShareUserId())
}

const openRoom = (roomId: string) => {
	router.push({ name: 'gomokuRoomWithUser', params: { id: roomId, userId: genShareUserId() } })
}

const enterAsUser = (roomId: string, playerId: string) => {
	router.push({ name: 'gomokuRoomWithUser', params: { id: roomId, userId: playerId } })
}

const closeRoom = async (roomId: string) => {
	if (!isAdmin.value) return
	if (!confirm(`确认关闭房间 ${roomId} 吗？`)) return
	closingRoomId.value = roomId
	try {
		await request(`gomoku/rooms/${roomId}`, 'DELETE')
		await fetchRooms()
	} finally {
		closingRoomId.value = ''
	}
}

onMounted(async () => {
	await userStore.getUserInfo()
	if (isAdmin.value) {
		await fetchRooms()
		autoRefreshTimer = window.setInterval(() => {
			fetchRooms({ silent: true })
		}, 5000)
	}
})

onUnmounted(() => {
	if (autoRefreshTimer !== null) {
		window.clearInterval(autoRefreshTimer)
		autoRefreshTimer = null
	}
})
</script>

<template>
	<List>
		<template #content v-if="isAdmin">
			<PageHeader>
				<template #left>
					五子棋房间列表（管理员）
				</template>
				<template #right>
					<Btn small @click="fetchRooms" :loading="loading">刷新</Btn>
					<Btn small type="primary" @click="createRoom">创建房间</Btn>
				</template>
			</PageHeader>
			<!-- <div class="admin-toolbar">
				<GreyText>五子棋房间列表（管理员）</GreyText>
				<div class="toolbar-actions">
					<Btn small @click="fetchRooms" :loading="loading">刷新</Btn>
					<Btn small type="primary" @click="createRoom">创建房间</Btn>
				</div>
			</div> -->

			<div v-if="loading" class="empty">加载中...</div>
			<div v-else-if="!rooms.length" class="empty">暂无房间</div>

			<div v-else class="room-list">
				<Card v-for="room in rooms" :key="room.id">
					<div class="room-head">
						<div class="room-main">
							<div class="room-id">{{ room.id }}</div>
							<div class="meta">
								<span>状态：{{ room.status }}</span>
								<span>人数：{{ room.connectedCount }}/{{ room.userCount }}</span>
								<span>回合：{{ room.round }}</span>
								<span v-if="room.winnerName">胜者：{{ room.winnerName }}</span>
							</div>
						</div>
						<div class="room-actions">
							<Btn small @click="copyRoomLink(room.id)">分享</Btn>
							<Btn small @click="openRoom(room.id)">进入</Btn>
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

					<div class="players">
						<div v-if="!room.users?.length" class="player-row empty-player">暂无玩家</div>
						<div v-for="player in room.users" :key="`${room.id}-${player.id}`" class="player-row">
							<div class="player-name">
								{{ player.name || '未命名玩家' }}
								<span class="player-status" :class="player.connectStatus">
									{{ player.connectStatus === 'connected' ? '在线' : '离线' }}
								</span>
							</div>
							<div class="player-actions">
								<Btn small @click="copyLink(room.id, player.id)">分享</Btn>
								<Btn small @click="enterAsUser(room.id, player.id)">进入</Btn>
							</div>
						</div>
					</div>
				</Card>
			</div>
		</template>
	</List>
</template>

<style lang="less" scoped>
.gomoku-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	width: 100%;
	max-width: 100vw;
	box-sizing: border-box;
	padding: 20px;
	text-align: left;
	gap: 0.75rem;
}

.admin-toolbar {
	width: min(100%, 760px);
	max-width: 760px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;

	.toolbar-actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}
}

.empty {
	width: min(100%, 760px);
	max-width: 760px;
	text-align: left;
	color: var(--text-secondary);
	font-size: 14px;
}

.room-list {
	width: min(100%, 760px);
	max-width: 760px;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.room-head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 0.75rem;
	padding-bottom: 0.5rem;
	border-bottom: 1px solid var(--border-light);
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

.room-actions {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	flex-wrap: wrap;
	flex: 0 0 auto;
}

.players {
	margin-top: 0.5rem;
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
}

.player-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
}

.player-name {
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 13px;
	color: var(--text);
	min-width: 0;
	word-break: break-all;
}

.player-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-wrap: wrap;
}

.player-status {
	font-size: 11px;
	line-height: 1;
	padding: 0.2rem 0.4rem;
	border-radius: 999px;
	background: var(--background);
	border: 1px solid var(--border-light);
	color: var(--text-secondary);

	&.connected {
		color: #2d8f45;
		border-color: #94d3a2;
	}

	&.disconnected {
		color: #b26a00;
		border-color: #ebc17a;
	}
}

.empty-player {
	font-size: 12px;
	color: var(--text-secondary);
}

@media (max-width: 700px) {
	.admin-toolbar {
		flex-direction: column;
		align-items: flex-start;
	}

	.room-head {
		flex-direction: column;
		align-items: flex-start;
	}
}
</style>
