<script setup lang="ts">
import Btn from '@/components/Btn.vue'

withDefaults(
  defineProps<{
    title: string
    backText?: string
    actionText?: string
  }>(),
  {
    backText: '返回',
    actionText: '',
  }
)

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'action'): void
}>()
</script>

<template>
  <div class="tool-navbar">
    <Btn class="tiny-btn" small @click="emit('back')">{{ backText }}</Btn>
    <div class="title">{{ title }}</div>
    <Btn v-if="actionText" class="tiny-btn" small @click="emit('action')">{{ actionText }}</Btn>
    <div v-else class="right-placeholder"></div>
  </div>
</template>

<style lang="less" scoped>
.tool-navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0;

  .title {
    font-size: 14px;
    font-weight: 700;
  }

  .tiny-btn {
    width: 16px !important;
    min-width: 16px;
    height: 16px;
    padding: 0;
    line-height: 16px;
    font-size: 12px;
  }

  .right-placeholder {
    width: 16px;
    height: 16px;
  }
}
</style>
