<script setup lang="ts">
import { ref, watch } from 'vue'
import draggable from 'vuedraggable'
import Btn from './Btn.vue'

const props = withDefaults(
  defineProps<{
    modelValue: any[]
    itemKey?: string
    enabled?: boolean
    sortText?: string
    doneText?: string
  }>(),
  {
    itemKey: '_id',
    enabled: true,
    sortText: '排序',
    doneText: '完成',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: any[]): void
  (e: 'confirm', value: any[]): void
}>()

const sortMode = ref(false)
const list = ref<any[]>([...props.modelValue])

// 非排序状态下跟随外部数据；排序中保持本地副本，避免拖动被外部刷新打断。
watch(
  () => props.modelValue,
  val => {
    if (!sortMode.value) list.value = [...val]
  }
)

const toggle = () => {
  if (sortMode.value) {
    sortMode.value = false
    emit('update:modelValue', [...list.value])
    emit('confirm', [...list.value])
  } else {
    list.value = [...props.modelValue]
    sortMode.value = true
  }
}
</script>

<template>
  <div class="sortable">
    <div class="sortable-toolbar">
      <slot name="toolbar" :sort-mode="sortMode" />
      <Btn v-if="enabled" size="small" @click="toggle">
        {{ sortMode ? doneText : sortText }}
      </Btn>
    </div>

    <draggable
      :list="list"
      :item-key="itemKey"
      handle=".sortable-handle"
      :disabled="!sortMode"
      :animation="180"
      class="sortable-list"
    >
      <template #item="{ element, index }">
        <div class="sortable-row">
          <div class="sortable-content">
            <slot :item="element" :index="index" :sort-mode="sortMode" />
          </div>
          <div v-if="sortMode" class="sortable-handle" aria-label="拖拽排序" title="拖拽排序">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style lang="less" scoped>
.sortable-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.sortable-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sortable-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sortable-content {
  flex: 1;
  min-width: 0;
}

.sortable-handle {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 12px;
  height: 24px;
  cursor: grab;
  touch-action: none;
  border-radius: 6px;
  background: var(--btn-bg);

  &:active {
    cursor: grabbing;
  }

  span {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--text-muted);
  }
}
</style>
