<script setup lang="ts">
import { useSlots } from 'vue';

const slots = useSlots()
const showTitle = slots.title
</script>

<template>
  <div class="card">
    <div class="title" v-if="showTitle">
      <slot name="title"></slot>
    </div>
    <slot></slot>
  </div>
</template>

<style lang="scss" scoped>
.card {
  padding: 1rem;
  border-radius: 0.5rem;
  background-color: white;
  & > .title {
    margin-bottom: 0.25rem;
    font-size: 18px;
    font-weight: bold;
    text-align: left;
  }
}
</style>
