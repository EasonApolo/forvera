<script setup lang="ts">
import { useImageStore } from '../store/image'

const imageStore = useImageStore()
const onClick = () => {
  imageStore.stopPreview()
}
</script>

<template>
  <transition name="fade">
    <div class="image-preview" @click="onClick" v-if="imageStore.show">
      <div class="bg"></div>
      <img class="image" :src="imageStore.url" />
    </div>
  </transition>
</template>

<style scoped lang="less">
.image-preview {
  position: fixed;
  display: flex;
  align-items: center;
  justify-content: center;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  .bg {
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.4);
  }
  .image {
    position: relative;
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
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
