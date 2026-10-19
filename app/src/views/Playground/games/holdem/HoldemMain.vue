<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { useToastStore } from '@/store/toast'
import { IHoldemRoom, HoldemNoticeEvent, HoldemUserActionEvent } from 'shared/types/games/holdem'
import PokerCard from './PokerCard.vue'
import HoldemFundsChart from './HoldemFundsChart.vue'

const { room, userId, socket } = defineProps<{
  room: IHoldemRoom
  userId: string
  socket: any // Game.vue 的可靠消息封装 ws
}>()

const toastStore = useToastStore()

const holdemRoom = computed(() => room as IHoldemRoom)

// ==================== 动作气泡数据（provide 给 HoldemPlayerBody） ====================

const userActions = ref<
  Record<string, { action: string; amount?: number; totalAmount?: number; timestamp: number }>
>({})
provide('holdemUserActions', userActions.value)

let actionTimers: number[] = []
const onUserAction = (data: {
  userId: string
  action: string
  amount?: number
  totalAmount?: number
  timestamp: number
}) => {
  userActions.value[data.userId] = data
  const timer = window.setTimeout(() => {
    if (userActions.value[data.userId]?.timestamp === data.timestamp) {
      delete userActions.value[data.userId]
    }
  }, 5000)
  actionTimers.push(timer)
}

const onNotice = (data: { message?: string }) => {
  if (data?.message) toastStore.showToast({ content: data.message, type: '!' })
}

// ==================== lifecycle ====================

onMounted(() => {
  socket.on(HoldemUserActionEvent, onUserAction)
  socket.on(HoldemNoticeEvent, onNotice)
})
onUnmounted(() => {
  socket.off(HoldemUserActionEvent, onUserAction)
  socket.off(HoldemNoticeEvent, onNotice)
  actionTimers.forEach((t) => clearTimeout(t))
  actionTimers = []
})
</script>

<template>
  <div v-if="room.status !== 'waiting'" class="holdem">
    <!-- 公共牌 -->
    <div v-if="room.status === 'playing'" class="community-cards">
      <div v-for="(card, index) in holdemRoom.communityCards || []" :key="index" class="card-item">
        <PokerCard :card="card" :isFacedown="card.isFacedown" />
      </div>
    </div>

    <!-- 资金变化图（一回合结束才显示） -->
    <HoldemFundsChart
      v-if="(room.roundResults || []).length && room.roundStatus === 'after'"
      :room="holdemRoom"
    />
  </div>
</template>

<style lang="less" scoped>
.holdem {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .community-cards {
    display: flex;
    justify-content: center;
    gap: 4px;
    min-height: 44px;
  }
}
</style>

