<template>
  <div class="component-list">
    <slot name="layout-title" class="title"></slot>
    <div class="layout-list">
      <slot name="content"></slot>
    </div>
  </div>
</template>

<style lang="scss">
.component-list {
  height: 100vh;
    overflow-y: auto;
    overflow-x: hidden;

  .layout-list {
    padding: 1rem 0.5rem 8rem;

    .card:not(:first-child) {
      margin-top: .5rem;
    }
  }
}
</style>