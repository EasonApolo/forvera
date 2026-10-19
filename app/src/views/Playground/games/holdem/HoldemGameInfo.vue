<script setup lang="ts">
import { computed } from 'vue'
import { IHoldemRoom } from 'shared/types/games/holdem'

const { room } = defineProps<{ room: IHoldemRoom }>()

const holdemRoom = computed(() => room as IHoldemRoom)

const isHandEnd = computed(
  () => !!holdemRoom.value.winnerIds?.length && holdemRoom.value.currentPlayerId === '',
)
const isDealing = computed(
  () =>
    room.roundStatus === 'ing' &&
    holdemRoom.value.currentPlayerId === '' &&
    !holdemRoom.value.winnerIds?.length,
)

const gamePhaseText = computed(() => {
  switch (holdemRoom.value.gamePhase) {
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

const statusText = computed(() => {
  if (room.status !== 'playing') return ''
  if (isHandEnd.value) {
    const names = holdemRoom.value.winnerIds
      .map((id) => room.users[id]?.name || id)
      .join(', ')
    return `获胜者: ${names}`
  }
  if (isDealing.value) return '已开牌，即将开始下一轮下注...'
  return gamePhaseText.value
})
</script>

<template>
  <span v-if="statusText" class="holdem-gameinfo">{{ statusText }}</span>
</template>

<style scoped lang="less">
.holdem-gameinfo {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
