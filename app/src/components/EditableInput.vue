<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    maxLength?: number
    inline?: boolean
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    maxLength: 20,
    inline: true,
    placeholder: '请输入',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit', value: string): void
  (e: 'cancel'): void
}>()

const editing = ref(false)
const draft = ref(props.modelValue || '')

watch(
  () => props.modelValue,
  (val) => {
    if (!editing.value) {
      draft.value = val || ''
    }
  },
)

const startEdit = () => {
  if (props.disabled) return
  editing.value = true
  draft.value = props.modelValue || ''
}

const submit = () => {
  const next = draft.value.slice(0, props.maxLength).trim()
  if (!next) {
    editing.value = false
    emit('cancel')
    return
  }
  editing.value = false
  emit('update:modelValue', next)
  emit('submit', next)
}

const cancel = () => {
  editing.value = false
  draft.value = props.modelValue || ''
  emit('cancel')
}
</script>

<template>
  <span v-if="!editing" class="editable-text" :class="{ inline: inline }" @click="startEdit">
    {{ modelValue || placeholder }}
  </span>
  <input
    v-else
    class="editable-input"
    :class="{ inline: inline }"
    v-model="draft"
    :maxlength="maxLength"
    :placeholder="placeholder"
    autofocus
    @keydown.enter.prevent="submit"
    @keydown.esc.prevent="cancel"
    @blur="submit"
  />
</template>

<style scoped lang="less">
.editable-text,
.editable-input {
  font: inherit;
  color: inherit;
}

.editable-text {
  cursor: text;
  border-bottom: 1px dashed var(--border-light);
}

.editable-input {
  border: 1px solid var(--border-light);
  border-radius: 4px;
  padding: 0.1rem 0.25rem;
  background: transparent;
  outline: none;
}

.inline {
  display: inline-block;
}
</style>
