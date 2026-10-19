<script setup lang="ts">
import Badge from '@/components/Badge.vue'
import { IXiangqiRoom } from 'shared/types/games/xiangqi'

const { room, user } = defineProps<{ room: IXiangqiRoom; user: any; userId: string }>()
</script>

<template>
  <Badge v-if="room.status === 'playing' && user.id === room.blackUserId" color="var(--bg)" text-color="var(--text)">
    <div class="badge-icon black"></div>
    将
  </Badge>
  <Badge v-else-if="room.status === 'playing' && user.id === room.whiteUserId" color="var(--bg)" text-color="var(--text)">
    <div class="badge-icon white"></div>
    帅
  </Badge>
  <Badge
    v-if="room.status === 'playing' && room.roundStatus === 'ing' && !room.winnerId && room.currentPlayerId === user.id"
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
