<script setup lang="ts">
import { ref } from 'vue'

const scrollerRef = ref<HTMLElement | null>(null)
const touchStartX = ref(0)
const scrollStartLeft = ref(0)

const onWheel = (event: WheelEvent) => {
  const scroller = scrollerRef.value
  if (!scroller) return

  event.preventDefault()
  event.stopPropagation()
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY
  scroller.scrollLeft += delta
}

const onTouchStart = (event: TouchEvent) => {
  const scroller = scrollerRef.value
  if (!scroller) return

  touchStartX.value = event.touches[0].clientX
  scrollStartLeft.value = scroller.scrollLeft
  event.stopPropagation()
}

const onTouchMove = (event: TouchEvent) => {
  const scroller = scrollerRef.value
  if (!scroller) return

  const deltaX = event.touches[0].clientX - touchStartX.value
  scroller.scrollLeft = scrollStartLeft.value - deltaX
  event.stopPropagation()
}
</script>

<template>
  <div
    ref="scrollerRef"
    class="horizontal-scroll"
    @wheel="onWheel"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @mousedown.stop
    @mousemove.stop
    @touchend.stop
    @touchcancel.stop
  >
    <slot></slot>
  </div>
</template>

<style scoped lang="less">
.horizontal-scroll {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}
</style>
