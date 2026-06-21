<script setup lang="ts">
withDefaults(defineProps<{
  images: string[]
  onClick?: (images: string[], index: number) => void
  badges?: number[]
  activeIndex?: number
  onBadgeClick?: (index: number) => void
  onDelete?: (index: number) => void
  pointerOnHover?: boolean
}>(), {
  pointerOnHover: false,
})
</script>

<template>
  <div class="gallery">
    <div
      class="item"
      :class="{ active: activeIndex === index }"
      v-for="(img, index) in images"
    >
      <div
        class="thumb"
        :class="{ clickable: pointerOnHover }"
        :style="{ backgroundImage: `url(${img})` }"
        @click.stop="onClick?.(images, index)"
      ></div>
      <div class="item-actions" v-if="onDelete || badges">
        <button
          v-if="badges"
          class="badge"
          type="button"
          @click.stop="onBadgeClick?.(index)"
        >{{ badges[index] || 0 }}</button>
        <button
          v-if="onDelete"
          class="remove"
          type="button"
          @click.stop="onDelete(index)"
        >×</button>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, 6rem);
  gap: 6px;
  justify-content: start;

  .item {
    position: relative;
    width: 6rem;
    height: 6rem;

    &.active .thumb {
      border: 2px solid #d93a35;
    }
  }

  .thumb {
    width: 100%;
    height: 100%;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    border-radius: 8px;
    border: 2px solid transparent;
    box-sizing: border-box;

    &.clickable {
      cursor: pointer;
    }
  }

  .item-actions {
    position: absolute;
    right: 4px;
    top: 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .badge,
  .remove {
    border: none;
    cursor: pointer;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
  }

  .badge {
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-size: 11px;
    color: #fff;
    background: #4d4f53;
  }

  .remove {
    width: 18px;
    height: 18px;
    font-size: 13px;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
  }
}
</style>
