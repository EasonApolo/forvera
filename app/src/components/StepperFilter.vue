<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    value: number | string | null
    min?: number
    max?: number
    options?: string[]
    placeholder?: string
    nullablePosition?: 'min' | 'max'
  }>(),
  {
    placeholder: '-',
    nullablePosition: 'min',
  }
)

const emit = defineEmits<{
  (e: 'update:value', value: number | string | null): void
}>()

const inOptionsMode = () => Array.isArray(props.options) && props.options.length > 0

const normalizeOptionValue = () => {
  if (!inOptionsMode()) return null
  if (typeof props.value === 'string' && props.options!.includes(props.value)) {
    return props.value
  }
  return null
}

const fallbackBound = () => {
  if (inOptionsMode()) {
    if (props.nullablePosition === 'max') {
      return props.options![props.options!.length - 1]
    }
    return props.options![0]
  }

  if (props.nullablePosition === 'min') {
    if (props.min !== undefined) return props.min
    if (props.max !== undefined) return props.max
  } else {
    if (props.max !== undefined) return props.max
    if (props.min !== undefined) return props.min
  }
  return 0
}

const prev = () => {
  if (inOptionsMode()) {
    const current = normalizeOptionValue()
    if (current === null) {
      emit('update:value', fallbackBound())
      return
    }

    const currentIndex = props.options!.indexOf(current)
    if (props.nullablePosition === 'min' && currentIndex <= 0) {
      emit('update:value', null)
      return
    }

    const nextIndex = Math.max(0, currentIndex - 1)
    emit('update:value', props.options![nextIndex])
    return
  }

  if (props.value === null || typeof props.value !== 'number') {
    emit('update:value', fallbackBound())
    return
  }

  if (props.nullablePosition === 'min' && props.min !== undefined && props.value <= props.min) {
    emit('update:value', null)
    return
  }

  const next = props.value - 1
  emit('update:value', props.min !== undefined ? Math.max(props.min, next) : next)
}

const next = () => {
  if (inOptionsMode()) {
    const current = normalizeOptionValue()
    if (current === null) {
      emit('update:value', fallbackBound())
      return
    }

    const lastIndex = props.options!.length - 1
    const currentIndex = props.options!.indexOf(current)
    if (props.nullablePosition === 'max' && currentIndex >= lastIndex) {
      emit('update:value', null)
      return
    }

    const nextIndex = Math.min(lastIndex, currentIndex + 1)
    emit('update:value', props.options![nextIndex])
    return
  }

  if (props.value === null || typeof props.value !== 'number') {
    emit('update:value', fallbackBound())
    return
  }

  if (props.nullablePosition === 'max' && props.max !== undefined && props.value >= props.max) {
    emit('update:value', null)
    return
  }

  const next = props.value + 1
  emit('update:value', props.max !== undefined ? Math.min(props.max, next) : next)
}
</script>

<template>
  <div class="stepper-filter">
    <button class="step-btn" @click="prev">‹</button>
    <div class="step-value">{{ value === null ? placeholder : value }}</div>
    <button class="step-btn" @click="next">›</button>
  </div>
</template>

<style scoped lang="less">
.stepper-filter {
  width: 180px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  background: #f1f1f1;
  color: #666;
  font-size: 16px;
}

.step-value {
  min-width: 64px;
  text-align: center;
  font-size: 14px;
}
</style>
