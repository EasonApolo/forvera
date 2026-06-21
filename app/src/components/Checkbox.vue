<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    size?: number
  }>(),
  {
    size: 16,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="checkbox"
    :class="{ checked: modelValue }"
    :style="{
      '--checkbox-size': `${size}px`,
    }"
    @click.stop="toggle"
    aria-label="checkbox"
  >
    <svg v-if="modelValue" class="icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.25 8.5l3 3.1 6-7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
</template>

<style scoped lang="less">
.checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: var(--checkbox-size);
  height: var(--checkbox-size);
  min-width: var(--checkbox-size);
  min-height: var(--checkbox-size);
  box-sizing: border-box;
  padding: 0;
  border-radius: 4px;
  border: 1px solid var(--border-light);
  background: #fff;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: var(--accent-color);
  }

  &.checked {
    background: var(--accent-color);
    border-color: var(--accent-color);
  }
}

.icon {
  width: 80%;
  height: 80%;
  display: block;
}
</style>