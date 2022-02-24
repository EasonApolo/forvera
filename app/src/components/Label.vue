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
  background-color: #E0E1E2;
  transition: .2s ease;
  cursor: pointer;
}
.active {
  background-color: #2285D0;
  color: white;
}
</style>
