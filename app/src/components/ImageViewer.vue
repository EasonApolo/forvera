<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useImageStore } from '../store/image'
import CircleBtn from './CircleBtn.vue'

const imageStore = useImageStore()

const scale = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const rotation = ref(0)
const dragging = ref(false)
const startX = ref(0)
const startY = ref(0)
const stageRef = ref<HTMLElement | null>(null)
const originalRef = ref<HTMLImageElement | null>(null)
const stageWidth = ref(0)
const stageHeight = ref(0)
const frameWidth = ref(0)
const frameHeight = ref(0)

const frameDisplayWidth = computed(() => frameWidth.value || stageWidth.value)
const frameDisplayHeight = computed(() => frameHeight.value || stageHeight.value)
let restoreHtmlOverflow = ''
let restoreBodyOverflow = ''

const transformStyle = computed(() => {
  return `translate(${translateX.value}px, ${translateY.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`
})

const updateLayout = () => {
  const originalEl = originalRef.value
  const stageEl = stageRef.value
  if (stageEl) {
    stageWidth.value = stageEl.clientWidth
    stageHeight.value = stageEl.clientHeight
  }

  const sourceWidth = originalEl?.naturalWidth || imageStore.width
  const sourceHeight = originalEl?.naturalHeight || imageStore.height

  if (!sourceWidth || !sourceHeight) {
    return
  }

  const fitScale = Math.min(
    stageWidth.value / sourceWidth,
    stageHeight.value / sourceHeight,
    1
  )
  frameWidth.value = Math.round(sourceWidth * fitScale)
  frameHeight.value = Math.round(sourceHeight * fitScale)
}

const resetTransform = () => {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  rotation.value = 0
}

const zoomBy = (delta: number) => {
  const nextScale = Math.min(4, Math.max(1, scale.value + delta))
  scale.value = Number(nextScale.toFixed(2))
  if (scale.value === 1) {
    translateX.value = 0
    translateY.value = 0
  }
}

const rotateRight = () => {
  rotation.value += 90
}

const closeViewer = () => {
  resetTransform()
  frameWidth.value = 0
  frameHeight.value = 0
  imageStore.stopPreview()
}

const onOriginalLoad = () => {
  updateLayout()
}

const onWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomBy(event.deltaY > 0 ? -0.1 : 0.1)
}

const onPointerDown = (event: PointerEvent) => {
  if (scale.value <= 1) {
    return
  }
  dragging.value = true
  startX.value = event.clientX - translateX.value
  startY.value = event.clientY - translateY.value
  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)
}

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value || scale.value <= 1) {
    return
  }
  translateX.value = event.clientX - startX.value
  translateY.value = event.clientY - startY.value
}

const onPointerUp = () => {
  dragging.value = false
}

onMounted(() => {
  window.addEventListener('resize', updateLayout)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayout)
  document.documentElement.style.overflow = restoreHtmlOverflow
  document.body.style.overflow = restoreBodyOverflow
})

watch(
  () => imageStore.show,
  async (show) => {
    if (!show) {
      document.documentElement.style.overflow = restoreHtmlOverflow
      document.body.style.overflow = restoreBodyOverflow
      return
    }
    restoreHtmlOverflow = document.documentElement.style.overflow
    restoreBodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    await nextTick()
    updateLayout()
  }
)

watch(
  () => imageStore.url,
  async () => {
    frameWidth.value = 0
    frameHeight.value = 0
    await nextTick()
    updateLayout()
  }
)
</script>

<template>
  <transition name="fade">
    <div
      v-if="imageStore.show"
      class="image-viewer"
      @click="closeViewer"
      @wheel.prevent="onWheel"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="viewer-bg" @click="closeViewer"></div>
      <CircleBtn class="close-btn" variant="overlay" icon="close" aria-label="close" :size="36" :mobile-size="40" @click.stop="closeViewer" />
      <div class="toolbox" @click.stop>
        <CircleBtn variant="overlay" aria-label="rotate-right" :size="34" :mobile-size="36" @click="rotateRight">
          <img class="rotate-icon" src="/rotate.svg" alt="" aria-hidden="true" />
        </CircleBtn>
      </div>
      <div class="stage" ref="stageRef">
        <div
          class="media-frame"
          :style="{
            transform: transformStyle,
            width: `${frameDisplayWidth}px`,
            height: `${frameDisplayHeight}px`,
          }"
          @click.stop
          @pointerdown.stop.prevent="onPointerDown"
          @dblclick="resetTransform"
        >
          <img
            class="thumb-layer"
            :src="imageStore.thumbUrl"
            :style="{
              width: `${frameDisplayWidth}px`,
              height: `${frameDisplayHeight}px`,
            }"
            draggable="false"
          />
          <img
            class="original-layer"
            :src="imageStore.url"
            ref="originalRef"
            draggable="false"
            :style="{
              width: `${frameDisplayWidth}px`,
              height: `${frameDisplayHeight}px`,
              cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            }"
            @load="onOriginalLoad"
          />
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped lang="less">
.image-viewer {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
}

.viewer-bg {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 3;
}

.toolbox {
  position: absolute;
  left: 1rem;
  top: 1rem;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.rotate-icon {
  width: 60%;
  height: 60%;
  object-fit: contain;
  display: block;
}

@media (max-width: 768px) {
  .close-btn {
    top: 0.75rem;
    right: 0.75rem;
  }

  .toolbox {
    left: 0.75rem;
    top: 0.75rem;
    gap: 0.25rem;
  }
}

.stage {
  position: relative;
  width: min(96vw, 1000px);
  height: min(92vh, 900px);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  z-index: 2;
}

.media-frame {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  transition: transform 0.08s ease-out;
}

.thumb-layer {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  object-fit: contain;
  object-position: center;
  border-radius: 8px;
  filter: none;
  opacity: 1;
  pointer-events: none;
}

.original-layer {
  position: relative;
  max-width: none;
  max-height: none;
  user-select: none;
  transform-origin: center center;
  transition: opacity 0.15s ease;
}

.fade-enter-active,
.fade-leave-active {
  transition: 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
