<script setup lang="ts">
import CircleBtn from './CircleBtn.vue'

const props = withDefaults(
  defineProps<{
    value: number | string | null
    min?: number
    max?: number
    options?: string[]
    loop?: boolean
    placeholder?: string
    nullablePosition?: 'min' | 'max'
    nullable?: boolean
    btnSize?: number
    btnFontSize?: number
    btnMobileSize?: number
    btnMobileFontSize?: number
  }>(),
  {
    loop: false,
    placeholder: '-',
    nullablePosition: 'min',
    nullable: true,
    btnSize: 32,
    btnFontSize: 18,
    btnMobileSize: 36,
    btnMobileFontSize: 20,
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
    if (props.loop) {
      const lastIndex = props.options!.length - 1
      const nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1
      emit('update:value', props.options![nextIndex])
      return
    }

    if (props.nullable && props.nullablePosition === 'min' && currentIndex <= 0) {
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

  if (props.loop && props.min !== undefined && props.max !== undefined && props.value <= props.min) {
    emit('update:value', props.max)
    return
  }

  if (props.nullable && props.nullablePosition === 'min' && props.min !== undefined && props.value <= props.min) {
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
    if (props.loop) {
      const nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1
      emit('update:value', props.options![nextIndex])
      return
    }

    if (props.nullable && props.nullablePosition === 'max' && currentIndex >= lastIndex) {
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

  if (props.loop && props.min !== undefined && props.max !== undefined && props.value >= props.max) {
    emit('update:value', props.min)
    return
  }

  if (props.nullable && props.nullablePosition === 'max' && props.max !== undefined && props.value >= props.max) {
    emit('update:value', null)
    return
  }

  const next = props.value + 1
  emit('update:value', props.max !== undefined ? Math.min(props.max, next) : next)
}
</script>

<template>
  <div class="stepper-filter">
    <CircleBtn class="step-btn" icon="chevron-left" aria-label="previous" :size="btnSize" :font-size="btnFontSize" :mobile-size="btnMobileSize" :mobile-font-size="btnMobileFontSize" @click="prev" />
    <div class="step-value">{{ value === null ? placeholder : value }}</div>
    <CircleBtn class="step-btn" icon="chevron-right" aria-label="next" :size="btnSize" :font-size="btnFontSize" :mobile-size="btnMobileSize" :mobile-font-size="btnMobileFontSize" @click="next" />
  </div>
</template>

<style scoped lang="less">
.stepper-filter {
  width: 180px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  column-gap: 0.5rem;
}

.step-btn {
  // 大小通过props控制
}

.step-value {
  min-width: 64px;
  text-align: center;
  font-size: 14px;
}

@media (max-width: 768px) {
  .stepper-filter {
    width: 100%;
    min-width: 0;
  }

  .step-value {
    flex: 1;
    min-width: 0;
    font-size: 15px;
  }
}
</style>
