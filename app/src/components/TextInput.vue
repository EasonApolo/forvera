<script setup lang="ts">
defineProps<{ type?: string }>()
</script>

<template>
  <input class="default-text-input" type="text" />
</template>

<style lang="scss" scoped>
.default-text-input {
  outline: none;
}
</style>