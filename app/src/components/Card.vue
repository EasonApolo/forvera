<script setup lang="ts">
import { useSlots } from 'vue'

const slots = useSlots()
const showTitle = slots.title
</script>

<template>
  <div class="card">
    <div class="title" v-if="showTitle">
      <slot name="title"></slot>
    </div>
    <slot></slot>
  </div>
</template>

<style lang="less" scoped>
.card {
  padding: .75rem;
  border-radius: 0.5rem;
  background-color: var(--card-bg);
  transition: background-color 0.25s ease;
  & > .title {
    margin-bottom: 5px;
    font-size: 15px;
    font-weight: bold;
    line-height: 16px;
    text-align: left;
  }
}
</style>
