<script setup lang="ts">
import Badge from '@/components/Badge.vue'
import { IGomokuRoom } from 'shared/types/games/gomoku'

const { room, user } = defineProps<{ room: IGomokuRoom; user: any; userId: string }>()
</script>

<template>
  <Badge v-if="room.status === 'playing' && user.id === room.blackUserId" color="var(--bg)" text-color="var(--text)">
    <div class="badge-icon black"></div>
    黑棋
  </Badge>
  <Badge v-else-if="room.status === 'playing' && user.id === room.whiteUserId" color="var(--bg)" text-color="var(--text)">
    <div class="badge-icon white"></div>
    白棋
  </Badge>
  <Badge
    v-if="room.status === 'playing' && room.roundStatus === 'ing' && !room.winnerId && !room.isDraw && room.currentPlayerId === user.id"
    color="#1890ff"
    text-color="white"
    type="loading"
  >
    思考中
  </Badge>
</template>

<style scoped lang="less">
.badge-icon {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 20px 1px var(--text);

  &.black {
    background: black;
  }

  &.white {
    background: white;
  }
}
</style>
