<script setup lang="ts">
defineProps<{ active?: boolean }>()
</script>

<template>
  <div class="label" :class="{ active: active }">
    <slot></slot>
  </div>
</template>

<style lang="less" scoped>
.label {
  padding: 0.375rem 1rem;
  color: var(--text);
  border-radius: 4px;
  background-color: var(--btn-bg);
  transition: 0.2s ease;
  cursor: pointer;
}
.active {
  background-color: #1a73e8;
  color: white;
}
</style>
