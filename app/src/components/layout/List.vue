<template>
  <slot name="title" class="layout-title"></slot>
  <div class="layout-list">
    <slot name="content"></slot>
  </div>
</template>

<style lang="less">
.layout-list {
  padding: 0.625rem 0.5rem 8rem;

  .card:not(:first-child) {
    margin-top: 0.5rem;
  }
}
</style>
