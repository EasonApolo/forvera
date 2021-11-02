<template>
  <div class="rbox" :class='{expand:expand}'>
    <div class='head' @click='expand=!expand'>
      <span class='title'>{{title}}</span>
      <slot name='sup'></slot>
    </div>
    <slot name='list'></slot>
  </div>
</template>

<script>
export default {
  name: 'layout',
  props: ['title'],
  data () {
    return {
      expand: false,
    }
  }
}
</script>

<style scoped lang="scss">
.rbox {
  margin-bottom: 1rem;
  border-radius: 1rem;
  background-color: #f6f6fc;
  text-align: left;
  overflow: hidden;
  .head {
    padding: 1rem;
    font-size: .875rem;
    .title {
      font-size: 1rem;
      font-weight: bold;
      margin-right: .5rem;
    }
  }
  .item {
    display: block;
    padding: .75rem 1rem;
    border-top: 1px solid #eee;
    font-size: .875rem;
    line-height: 1.25rem;
    transition: background-color .2s ease-in-out;
    cursor: pointer;
    &:hover {
      background-color: #eeeef4;
    }
  }
  .disabled {
    color: #888;
  }
  .active {
    background-color: #f1f1ff;
  }
  .no-border {
    border: none;
  }
  .second {
    border: none;
    padding: .25rem 1.5rem .25rem 2rem !important;
    color: #888 !important;
  }
}
@media (max-width: 750px) {
  .rbox {
    display: flex;
    width: 100%;
    margin: 0;
    line-height: 1.5rem;
    align-items: center;
    border-radius: 0;
    background-color: #fff;
    &::-webkit-scrollbar {
      height: 0 !important;
    }
    .item {
      background-color: #f6f6f6;
    }
    .title {
      padding: .5rem 1rem;
      font-weight: bold;
      white-space: nowrap;
    }
    .active {
      background-color: #5C5FEA !important;
      color: #fff !important;
    }
  }
  .rbox:not(.expand) {
    padding: 0;
    border-top: 1px solid #eee;
    overflow-x: scroll;
    .item {
      margin-right: .5rem;
      padding: 0 .625rem !important;
      height: 1.75rem;
      line-height: 1.75rem;
      border-radius: 1rem;
      border: none;
      white-space: nowrap;
      &:last-child {
        margin-right: 0;
      }
    }
    .plain {
      padding: 0 !important;
    }
  }
  .expand {
    flex-direction: column;
    &>.title {
      order: 100;
      border-top: 1px solid #eee;
    }
    .title, .item {
      width: calc(100% - 2rem);
    }
    .item {
      height: auto;
      line-height: auto;
      border-top: 1px solid #eee;
      order: 0;
    }
  }
}
</style>