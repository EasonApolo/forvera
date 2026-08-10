<script setup lang="ts">
import { IDrawGuessRoom } from 'shared/types/games/drawguess';

defineProps<{
  room: IDrawGuessRoom;
  userId: string;
}>();
</script>

<template>
  <div v-if="room.status === 'playing'" class="info">第 {{ room.turn }} / {{ room.maxRounds }} 回合</div>
</template>

<style lang="less" scoped>
.info {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>