<script setup lang="ts">
defineProps<{ images: string[], onClick?: (index: number) => void }>()
</script>

<template>
  <div class="gallery">
    <div
      class="item"
      :style="{ backgroundImage: `url(${img})` }"
      v-for="(img, index) in images"
      @click="onClick?.(index)"
    ></div>
  </div>
</template>

<style lang="scss" scoped>
.gallery {
  display: flex;
  grid-template-columns: repeat(auto-fill, 6rem);
  grid-gap: 1rem;
  .item {
    width: 6rem;
    height: 6rem;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
  }
}
</style>
