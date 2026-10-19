<script setup lang="ts">
import { computed } from 'vue'
import Badge from '@/components/Badge.vue'
import { IHoldemRoom, IHoldemUser } from 'shared/types/games/holdem'

const { room, user } = defineProps<{ room: IHoldemRoom; user: IHoldemUser; userId: string }>()

// ⚠️ 必须是 computed：这些值随 sync 更新，普通 const 只在组件创建时算一次，badge 会冻结
const isHandEnd = computed(() => !!room.winnerIds?.length && room.currentPlayerId === '')
const isSeated = computed(() => (room.playerIds || []).includes(user.id))
const isPlaying = computed(() => room.status === 'playing' && isSeated.value)
const waitingForAction = computed(
  () =>
    isPlaying.value && !isHandEnd.value && !user.isAsked && !user.isAllIn && !user.isQuitBet,
)
</script>

<template>
  <!-- 中局加入、本局未入座的玩家 -->
  <Badge v-if="room.status === 'playing' && !isSeated" color="#8c8c8c" text-color="white">
    等待中
  </Badge>
  <template v-if="isPlaying">
    <Badge v-if="user.isSmallBlind" color="#52c41a" text-color="white">小盲</Badge>
    <Badge v-if="user.isBigBlind" color="#fa8c16" text-color="white">大盲</Badge>
    <Badge v-if="user.isAllIn" color="rgb(255, 43, 43)" text-color="white">梭哈</Badge>
    <Badge v-if="user.isQuitBet" color="#faad14" text-color="white">弃牌</Badge>
    <Badge v-if="waitingForAction" color="#faad14" text-color="white">待加注</Badge>
    <Badge
      v-if="!isHandEnd && room.roundStatus === 'ing' && room.currentPlayerId === user.id"
      color="#1890ff"
      text-color="white"
      type="loading"
    >
      思考中
    </Badge>
    <Badge
      v-if="isHandEnd && room.winnerIds?.includes(user.id)"
      color="#ff4d4f"
      text-color="white"
    >
      获胜
    </Badge>
  </template>
</template>
