<script setup lang="ts">
defineProps<{ show?: Boolean }>()
</script>

<template>
  <transition name="fade">
    <div class="popper" v-if="show">
      <slot name="title" class="title"></slot>
      <div class="content">
        <slot name="content"></slot>
      </div>
    </div>
  </transition>
</template>

<style lang="less" scoped>
.popper {
  position: absolute;
  margin-top: 1rem;
  padding: 0.5rem 0.75rem;
  filter: drop-shadow(1px 1px 8px #eee);
  box-shadow: 0px 2px 8px 1px #ddd;
  background-color: white;
  border-radius: 0.5rem;
  transition: transform 0.2s ease, opacity 0.2s ease;

  &:before {
    @size: 8px;
    content: '';
    position: absolute;
    top: -2 * @size;
    left: 1rem;
    border: @size solid transparent;
    border-bottom: @size solid white;
  }
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
