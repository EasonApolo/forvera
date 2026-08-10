<script setup lang="ts">
import Badge from '@/components/Badge.vue';
import { ChatMessage } from 'shared/types/game';
import type { IDrawGuessUser } from 'shared/types/games/drawguess';
import { DrawGuessChatMsgTypes, IDrawGuessRoom } from 'shared/types/games/drawguess';
import { computed } from 'vue';

const { msg } = defineProps<{
  msg: ChatMessage
}>();
</script>

<template>
  <div class="guess-correct" v-if="msg.type === DrawGuessChatMsgTypes.GuessCorrect">{{ msg.userName }}猜对了</div>
</template>

<style lang="less" scoped>
.guess-correct {
  color: #52c41a;
  font-weight: 600;
  background: var(--quote-bg);
  
}
</style>
