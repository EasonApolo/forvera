<script setup lang="ts">
import { requestProgress } from '@/utils/requestProgress'
</script>

<template>
  <div class="request-progress" :class="{ visible: requestProgress.visible }">
    <div class="fill" :style="{ width: `${requestProgress.progress}%` }"></div>
  </div>
</template>

<style scoped lang="less">
.request-progress {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 2000;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;

  &.visible {
    opacity: 1;
  }

  .fill {
    height: 100%;
    width: 0;
    background: linear-gradient(90deg, transparent, var(--primary-color));
    border-radius: 0 999px 999px 0;
    transition: width 0.25s ease;
  }
}
</style>
