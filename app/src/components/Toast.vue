<script setup lang="ts">
import { useToastStore } from '../store/toast'

import { storeToRefs } from 'pinia'
import CircleBtn from './CircleBtn.vue'
import Loading from './Loading.vue'

const toastStore = useToastStore()
const { toasts } = storeToRefs(toastStore)

const getToastSymbol = (type: string) => {
  if (type === '?') return '?'
  if (type === '!') return '!'
  if (type === 'OK') return 'OK'
  if (type === 'ERR') return 'Oops'
  return ''
}
</script>

<template>
  <div class="toast-wrapper" v-if="toasts.length">
    <transition-group name="toast-slide" tag="div" class="toast-stack">
      <div class="toast" v-for="toast in toasts" :key="toast.id">
        <CircleBtn
          v-if="toast.type === 'loading'"
          class="icon-btn"
          variant="overlay"
          :size="30"
          :fontSize="16"
          aria-label="loading"
        >
          <div class="loading-wrap">
            <Loading />
          </div>
        </CircleBtn>
        <CircleBtn
          v-else
          class="icon-btn"
          variant="overlay"
          :size="30"
          :fontSize="13"
          aria-label="toast icon"
          :style="{ 'font-weight': toast.type === '?' || '!' ? 'bold' : 'normal' }"
        >
          {{ getToastSymbol(toast.type) }}
        </CircleBtn>
        <div class="content">{{ toast.content }}</div>
      </div>
    </transition-group>
  </div>
</template>

<style lang="less" scoped>
.toast-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  z-index: 1000;
  padding: 0.75rem 0.75rem 0;
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.toast {
  min-width: 1rem;
  box-sizing: border-box;
  min-height: 52px;
  padding: 0.65rem 0.8rem;
  box-shadow: var(--toast-shadow);
  background-color: var(--toast-bg);
  border-radius: 0.85rem;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 0.65rem;
  pointer-events: auto;

  .icon-btn {
    flex: 0 0 auto;
    color: var(--accent-color);
    background: var(--card-bg);
    box-shadow: none;
  }

  .loading-wrap {
    display: flex;
    align-items: center;
    justify-content: center;

    :deep(.loading-svg) {
      width: 14px;
      height: 14px;
    }
  }

  .content {
    flex: 1;
    font-size: 14px;
    line-height: 1.35;
    color: var(--toast-text);
  }
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: 0.25s ease;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.toast-slide-move {
  transition: transform 0.25s ease;
}
</style>
