<script setup lang="ts">
defineProps<{ active?: boolean }>()
</script>

<template>
  <div class="label" :class="{active: active}">
    <slot></slot>
  </div>
</template>

<style lang="scss" scoped>
.label {
  padding: .375rem 1rem;
  color: rgba(0, 0, 0, .6);
  border-radius: 4px;
  background-color: rgba(13,12,34,0.05);
  transition: .2s ease;
  cursor: pointer;
}
.active {
  background-color: #1a73e8;
  color: white;
}
</style>
