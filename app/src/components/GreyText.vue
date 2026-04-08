<script setup lang="ts">
withDefaults(
  defineProps<{
    align?: 'left' | 'center'
  }>(),
  {
    align: 'left',
  }
)
</script>

<template>
  <div class="grey-text" :class="`align-${align}`">
    <slot></slot>
  </div>
</template>

<style scoped lang="less">
.grey-text {
  margin: .5rem 0 0.5rem 3px;
  font-size: 14px;
  color: var(--text-muted);
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.align-left {
  text-align: left;
}

.align-center {
  text-align: center;
}
</style>
