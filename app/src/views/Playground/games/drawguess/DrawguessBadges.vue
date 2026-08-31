<script setup lang="ts">
import Badge from '@/components/Badge.vue'
import type { IDrawGuessUser } from 'shared/types/games/drawguess'
import { IDrawGuessRoom } from 'shared/types/games/drawguess'
import { computed } from 'vue'

const { room, user, userId } = defineProps<{
  room: IDrawGuessRoom
  user: IDrawGuessUser
  userId: string
}>()

const totalScore = computed(() => {
  return {
    show: room.status === 'playing',
    text: `总分: ${user.totalScore || 0}`,
  }
})
const status = computed(() => {
  let text = ''
  if (user.id === room.drawerId) {
    if (room.turnStatus === 'ing') {
      text = '正在画'
    } else {
      text = '画'
    }
    text += ` +${user.turnScore || 0}`
  } else {
    if (room.turnStatus === 'ing' && (user.turnScore || 0) === 0) {
      text = '正在猜'
    } else {
      text = '猜'
      if (user.turnScore || room.turnStatus === 'after') {
        text += ` +${user.turnScore || 0}`
      }
    }
  }
  return {
    show: room.status === 'playing' && room.roundStatus === 'ing',
    loading: room.status === 'playing' && room.turnStatus === 'ing' && (user.turnScore || 0) === 0,
    color: user.id === room.drawerId ? '#13c2c2' : '#faad14',
    text,
  }
})
</script>

<template>
  <template v-if="room.status === 'playing'">
    <Badge v-if="totalScore.show" color="#52c41a" text-color="white" :text="totalScore.text" />
    <Badge
      v-if="status.show"
      :color="status.color"
      text-color="white"
      :type="status.loading ? 'loading' : undefined"
      :text="status.text"
    />
  </template>
</template>

<style lang="less" scoped></style>
