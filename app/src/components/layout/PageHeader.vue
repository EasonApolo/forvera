<template>
  <div class="page-header">
    <div class="page-header__left">
      <slot name="left"></slot>
    </div>
    <div class="page-header__right">
      <slot name="right"></slot>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="less">
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.page-header__left,
.page-header__right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>
