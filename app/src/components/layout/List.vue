<template>
  <slot name="layout-title" class="title"></slot>
  <div class="layout-list"><slot name="content"></slot></div>
</template>

<style lang="scss">
.layout-title {

}
.layout-list {
  .card:not(:first-child) {
    margin-top: .5rem;
  }
}
</style>