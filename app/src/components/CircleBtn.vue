<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    fontSize?: number
    mobileSize?: number
    mobileFontSize?: number
    variant?: 'muted' | 'overlay'
    icon?: 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down' | 'rotate-left' | 'rotate-right' | 'close'
    ariaLabel?: string
  }>(),
  {
    size: 32,
    fontSize: 18,
    mobileSize: 36,
    mobileFontSize: 20,
    variant: 'muted',
    icon: undefined,
    ariaLabel: '',
  },
)

const styleVars = computed(() => ({
  '--circle-btn-size': `${props.size}px`,
  '--circle-btn-font-size': `${props.fontSize}px`,
  '--circle-btn-mobile-size': `${props.mobileSize}px`,
  '--circle-btn-mobile-font-size': `${props.mobileFontSize}px`,
}))
</script>

<template>
  <button
    type="button"
    class="circle-btn"
    :class="`circle-btn--${variant}`"
    :style="styleVars"
    :aria-label="ariaLabel || icon || undefined"
  >
    <svg v-if="icon === 'chevron-left'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14.5 6.5L9 12l5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'chevron-right'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 6.5L15 12l-5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'chevron-up'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 14.5L12 9l5.5 5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'chevron-down'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 9.5L12 15l5.5-5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'rotate-left'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 9V5m0 0H3m4 0l-2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M7 5a8 8 0 1 1-2.3 5.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'rotate-right'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M17 9V5m0 0h4m-4 0l2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M17 5a8 8 0 1 0 2.3 5.7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'close'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 6.5l11 11m0-11l-11 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
    <slot v-else></slot>
  </button>
</template>

<style scoped lang="less">
.circle-btn {
  appearance: none;
  -webkit-appearance: none;
  width: var(--circle-btn-size);
  height: var(--circle-btn-size);
  flex: 0 0 var(--circle-btn-size);
  padding: 0;
  border: none;
  border-radius: 999px;
  line-height: 1;
  font-size: var(--circle-btn-font-size);
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  touch-action: manipulation;
}

.circle-btn-icon {
  width: 60%;
  height: 60%;
  display: block;
  flex: 0 0 auto;
}

.circle-btn--muted {
  background: #f1f1f1;
  color: #666;
}

.circle-btn--overlay {
  background: rgba(255, 255, 255, 0.9);
  color: #333;
}

@media (max-width: 768px) {
  .circle-btn {
    width: var(--circle-btn-mobile-size);
    height: var(--circle-btn-mobile-size);
    flex-basis: var(--circle-btn-mobile-size);
    font-size: var(--circle-btn-mobile-font-size);
  }
}
</style>
