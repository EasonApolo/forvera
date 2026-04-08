<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number
    placeholder?: string
    rows?: number
    small?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: '',
    rows: 3,
    small: false,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const onInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <textarea
    v-bind="$attrs"
    class="textarea"
    :class="{ small: small }"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows"
    @input="onInput"
  ></textarea>
</template>

<style scoped lang="less">
.textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  font-size: 14px;
  line-height: 1.5;
  background: var(--bg);
  color: var(--text);
  resize: vertical;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  transition: border-color 0.125s ease, background-color 0.125s ease;

  &:hover {
    border-color: var(--accent-color);
  }

  &:focus {
    outline: none;
    border-color: var(--accent-color);
    background: var(--card-bg);
  }

  &.small {
    padding: 0.45rem 0.6rem;
    border-radius: 0.6rem;
    font-size: 13px;
  }
}
</style>
