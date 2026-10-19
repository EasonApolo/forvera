<script setup lang="ts">
import Badge from '@/components/Badge.vue'
import { ICheckersRoom, ICheckersUser } from 'shared/types/games/checkers'

const { room, user } = defineProps<{ room: ICheckersRoom; user: ICheckersUser; userId: string }>()

const colorName: Record<string, string> = {
  yellow: '黄棋',
  blue: '蓝棋',
  red: '红棋',
}
const colorHex: Record<string, string> = {
  yellow: '#FFD700',
  blue: '#4169E1',
  red: '#DC143C',
}
</script>

<template>
  <Badge
    v-if="room.status === 'playing' && user.color"
    color="var(--bg)"
    text-color="var(--text)"
  >
    <div class="badge-icon" :style="{ background: colorHex[user.color] }"></div>
    {{ colorName[user.color] || '' }}
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
}
</style>
