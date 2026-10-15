<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    size?: number
    fontSize?: number
    mobileSize?: number
    mobileFontSize?: number
    variant?: 'muted' | 'overlay'
    icon?: 'chevron-left' | 'chevron-right' | 'chevron-up' | 'chevron-down' | 'rotate-left' | 'rotate-right' | 'close' | 'auto-adjust-zoom' | 'settings'
    ariaLabel?: string
  }>(),
  {
    size: 32,
    fontSize: 18,
    mobileSize: undefined,
    mobileFontSize: undefined,
    variant: 'muted',
    icon: undefined,
    ariaLabel: '',
  },
)

const styleVars = computed(() => ({
  '--circle-btn-size': `${props.size}px`,
  '--circle-btn-font-size': `${props.fontSize}px`,
  '--circle-btn-mobile-size': `${props.mobileSize ?? props.size}px`,
  '--circle-btn-mobile-font-size': `${props.mobileFontSize ?? props.fontSize}px`,
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
      <path d="M3 2v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M3 8a9 9 0 1 0 2.83-6.36L3 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'rotate-right'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 2v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M21 8a9 9 0 1 1-2.83-6.36L21 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <svg v-else-if="icon === 'close'" class="circle-btn-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 6.5l11 11m0-11l-11 11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
    <svg v-else-if="icon === 'settings'" class="circle-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-1.91-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
    </svg>
    <span v-else-if="icon === 'auto-adjust-zoom'" class="auto-adjust-zoom-icon" aria-hidden="true"></span>
    <slot v-else></slot>
  </button>
</template>

<style scoped lang="less">
.auto-adjust-zoom-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  opacity: .4;
  background:
    linear-gradient(var(--text) 0 0) left top/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) left top/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) right top/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) right top/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) left bottom/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) left bottom/1.5px 5px no-repeat,
    linear-gradient(var(--text) 0 0) right bottom/5px 1.5px no-repeat,
    linear-gradient(var(--text) 0 0) right bottom/1.5px 5px no-repeat;

}
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
  background: var(--btn-bg);
  color: var(--text-secondary);

  &:hover {
    background: var(--btn-hover);
  }
}

.circle-btn--overlay {
  background: var(--card-bg);
  color: var(--text-color);
  box-shadow: 0 2px 8px var(--nav-shadow);

  &:hover {
    background: var(--btn-bg);
  }
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
