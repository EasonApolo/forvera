<script setup lang="ts">
defineProps<{
  images: string[]
  onClick?: (images: string[], index: number) => void
}>()
</script>

<template>
  <div class="gallery">
    <div
      class="item"
      :style="{ backgroundImage: `url(${img})` }"
      v-for="(img, index) in images"
      @click.stop="onClick?.(images, index)"
    ></div>
  </div>
</template>

<style lang="less" scoped>
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
  grid-gap: 1rem;
  .item {
    width: 6rem;
    height: 6rem;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    border-radius: 4px;
  }
}
</style>
