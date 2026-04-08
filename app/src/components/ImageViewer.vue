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

  if (!originalEl || !originalEl.naturalWidth || !originalEl.naturalHeight) {
    return
  }

  const fitScale = Math.min(
    stageWidth.value / originalEl.naturalWidth,
    stageHeight.value / originalEl.naturalHeight,
    1
  )
  frameWidth.value = Math.round(originalEl.naturalWidth * fitScale)
  frameHeight.value = Math.round(originalEl.naturalHeight * fitScale)
}

const resetTransform = () => {
  scale.value = 1
  translateX.value = 0
  translateY.value = 0
  rotation.value = 0
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
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const nextScale = Math.min(4, Math.max(1, scale.value + delta))
  scale.value = Number(nextScale.toFixed(2))
  if (scale.value === 1) {
    translateX.value = 0
    translateY.value = 0
  }
}

const onPointerDown = (event: PointerEvent) => {
  if (scale.value <= 1) {
    return
  }
  dragging.value = true
  startX.value = event.clientX - translateX.value
  startY.value = event.clientY - translateY.value
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
})

watch(
  () => imageStore.show,
  async (show) => {
    if (!show) return
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
    <div v-if="imageStore.show" class="image-viewer" @wheel="onWheel" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <div class="viewer-bg" @click="closeViewer"></div>
      <CircleBtn class="close-btn" variant="overlay" icon="close" aria-label="close" :size="36" :mobile-size="40" @click="closeViewer" />
      <div class="stage" ref="stageRef">
        <div
          class="media-frame"
          :style="{
            transform: transformStyle,
            width: `${frameDisplayWidth}px`,
            height: `${frameDisplayHeight}px`,
          }"
          @pointerdown.stop.prevent="onPointerDown"
          @dblclick="resetTransform"
        >
          <img
            class="thumb-layer"
            :src="imageStore.thumbUrl"
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

@media (max-width: 768px) {
  .close-btn {
    top: 0.75rem;
    right: 0.75rem;
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
  width: 120px;
  height: 120px;
  object-fit: cover;
  object-position: center;
  border-radius: 8px;
  filter: none;
  opacity: 1;
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
