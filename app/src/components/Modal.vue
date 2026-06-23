<script setup lang="ts">
import { computed } from 'vue'
import Btn from './Btn.vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    cancelText?: string
    confirmText?: string
    confirmLoading?: boolean
    closeOnMask?: boolean
    placement?: 'bottom' | 'center'
    hideFooter?: boolean
  }>(),
  {
    title: '',
    cancelText: '取消',
    confirmText: '确认',
    confirmLoading: false,
    closeOnMask: true,
    placement: 'center',
    hideFooter: false,
  }
)

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'cancel'): void
  (e: 'confirm'): void
}>()

const maskClass = computed(() => ({
  'placement-bottom': props.placement === 'bottom',
  'placement-center': props.placement === 'center',
}))

const close = () => {
  emit('update:show', false)
}

const handleCancel = () => {
  emit('cancel')
}

const handleConfirm = () => {
  emit('confirm')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-mask" :class="maskClass" @click.self="closeOnMask && close()">
      <div class="modal-panel">
        <div v-if="title" class="modal-title">{{ title }}</div>
        <div class="modal-content">
          <slot></slot>
        </div>
        <div v-if="!hideFooter" class="modal-actions">
          <Btn @click="handleCancel">{{ cancelText }}</Btn>
          <Btn type="primary" :loading="confirmLoading" @click="handleConfirm">{{ confirmText }}</Btn>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="less" scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);

  &.placement-bottom {
    align-items: flex-end;
  }

  &.placement-center {
    align-items: center;
  }
}

.modal-panel {
  width: min(100%, 720px);
  max-height: calc(100vh - 32px);
  overflow: auto;
  border-radius: 0.9rem;
  background: var(--card-bg);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.18);
  padding: 0.95rem;
  -webkit-font-smoothing: antialiased;
  font-size: 13px;
  line-height: 1.45;
}

.modal-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}

.modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 0.9rem;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .modal-actions {
    justify-content: flex-end;
  }
}
</style>