<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    content?: string
    align?: 'left' | 'center' | 'right'
    placement?: 'center' | 'left' | 'right'
  }>(),
  { content: '', align: 'left', placement: 'center' },
)

const open = ref(false)
const triggerRef = ref<HTMLElement | null>(null)
const popRef = ref<HTMLElement | null>(null)
const panelPosition = ref({ top: 0, left: 0 })

const updatePanelPosition = () => {
  if (!open.value || !triggerRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const panelRect = popRef.value?.getBoundingClientRect()
  const panelWidth = panelRect?.width || 0
  const panelHeight = panelRect?.height || 0
  const gap = 6
  const viewportPadding = 8

  let left = triggerRect.left
  if (props.placement === 'center') {
    left = triggerRect.left + triggerRect.width / 2 - panelWidth / 2
  } else if (props.placement === 'right') {
    left = triggerRect.right - panelWidth
  }

  left = Math.min(
    window.innerWidth - viewportPadding - panelWidth,
    Math.max(viewportPadding, left),
  )

  let top = triggerRect.top - panelHeight - gap
  if (top < viewportPadding) {
    top = triggerRect.bottom + gap
  }

  panelPosition.value = { top, left }
}

const toggle = (event: MouseEvent) => {
  event.stopPropagation()
  open.value = !open.value
}

const handleDocClick = (event: MouseEvent) => {
  if (!open.value) return
  const target = event.target as Node
  if (
    triggerRef.value?.contains(target) ||
    popRef.value?.contains(target)
  ) {
    return
  }
  open.value = false
}

const panelStyle = computed(() => {
  return {
    top: `${panelPosition.value.top}px`,
    left: `${panelPosition.value.left}px`,
  }
})

// Arrow horizontal position
const arrowStyle = computed(() => {
  if (props.placement === 'left') {
    return { left: '0.55rem', transform: 'none' }
  }
  if (props.placement === 'right') {
    return { right: '0.55rem', left: 'auto', transform: 'none' }
  }
  return { left: '50%', transform: 'translateX(-50%)' }
})

onMounted(() => {
  document.addEventListener('click', handleDocClick, true)
  window.addEventListener('resize', updatePanelPosition)
  window.addEventListener('scroll', updatePanelPosition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocClick, true)
  window.removeEventListener('resize', updatePanelPosition)
  window.removeEventListener('scroll', updatePanelPosition, true)
})

watch(open, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updatePanelPosition()
})
</script>

<template>
  <span class="popover-wrap">
    <button ref="triggerRef" class="pop-trigger" @click="toggle" type="button">?</button>
    <Teleport to="body">
      <Transition name="pop-fade">
        <div v-if="open" ref="popRef" class="pop-panel" :style="panelStyle" @click.stop>
          <div class="pop-arrow" :style="arrowStyle"></div>
          <div class="pop-arrow-inner" :style="arrowStyle"></div>
          <slot>
            <div class="pop-lines" :style="{ textAlign: align }">
              <div
                v-for="(line, idx) in content.split('\n').filter(Boolean)"
                :key="idx"
                class="pop-line"
              >{{ line }}</div>
            </div>
          </slot>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped lang="less">
.popover-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.pop-trigger {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;

  &:hover {
    background: var(--border-light);
  }
}

.pop-panel {
  position: fixed;
  z-index: 2000;
  width: max-content;
  min-width: 8rem;
  max-width: min(80vw, 22rem);
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  box-shadow: 0 6px 20px var(--nav-shadow);
  white-space: normal;
  color: var(--text);
  font-weight: 400;
}

.pop-arrow,
.pop-arrow-inner {
  position: absolute;
  bottom: -5px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid var(--border-light);
  z-index: 1;
}

.pop-arrow-inner {
  bottom: -4px;
  border-left-width: 4px;
  border-right-width: 4px;
  border-top: 4px solid var(--card-bg);
  z-index: 2;
}

.pop-lines {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  color: var(--text);
  font-weight: 400;
}

.pop-line {
  font-size: 12px;
  color: var(--text);
  line-height: 1.4;
  font-weight: 400;
}

.pop-fade-enter-active,
.pop-fade-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.pop-fade-enter-from,
.pop-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
