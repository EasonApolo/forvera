<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string | number
    placeholder?: string
    small?: boolean
    password?: boolean
    type?: string
  }>(),
  {
    modelValue: '',
    placeholder: '',
    small: false,
    password: false,
    type: 'text',
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const inputType = computed(() => (props.password ? 'password' : props.type))

const onInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    v-bind="$attrs"
    class="input"
    :class="{ small: small }"
    :type="inputType"
    :value="modelValue"
    :placeholder="placeholder"
    @input="onInput"
  />
</template>

<style scoped lang="less">
.input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  font-size: 14px;
  line-height: 1.2;
  background: var(--bg);
  color: var(--text);
  transition: border-color 0.125s ease, background-color 0.125s ease;

  &:hover {
    border-color: var(--accent-color);
  }

  &:focus {
    outline: none;
    border-color: var(--accent-color);
    background: var(--card-bg);
  }

  &:autofill,
  &:-webkit-autofill,
  &:-webkit-autofill:hover,
  &:-webkit-autofill:focus,
  &:-webkit-autofill:active {
    -webkit-text-fill-color: var(--text);
    box-shadow: 0 0 0 1000px var(--card-bg) inset;
    caret-color: var(--text);
    background-color: var(--card-bg) !important;
    transition: background-color 9999s ease-out 0s;
  }

  &.small {
    padding: 0.45rem 0.6rem;
    border-radius: 0.6rem;
    font-size: 13px;
  }
}
</style>
