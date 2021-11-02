<template>
  <div class='select'>
    <div v-for='opt in options' :key='opt.name' class='option' :class='{active:opt.name==active,disabled:opt.disabled}' @click='select(opt)'>{{ opt.value }}</div>
  </div>
</template>

<script>
export default {
  name: 'sel',
  props: ['options'],
  data () {
    return {
      active: null
    }
  },
  mounted () {
    this.active = this.options.find(opt => opt.default).name
  },
  methods: {
    select (opt) {
      if (!opt.disabled) {
        this.active = opt.name
        this.$emit('select', this.active)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.select {
  display: flex;
  border-radius: 2rem;
  font-size: .875rem;
  transition: all .2s ease;
  line-height: calc(1.5rem - 2px);
  cursor: pointer;
  user-select: none;
  color: #888;
  .option {
    padding: 0 .375rem;
    transition: background-color .2s ease;
    border: 1px solid #ccc;
    border-right: none;
    &:first-child {
      padding-left: .55rem;
      border-radius: 1rem 0 0 1rem;
    }
    &:last-child {
      padding-right: .55rem;
      border-radius: 0 1rem 1rem 0;
      border-right: 1px solid #ccc;
    }
    &:hover {
      color: white;
      border: 1px solid rgb(110, 110, 253);
      &+.option {
        border-left: none;
      }
      background-color: rgb(110, 110, 253);
    }
    &.active {
      color: white;
      border: 1px solid rgb(160, 160, 253);
      background-color: rgb(160, 160, 253);
    }
    &.disabled {
      color: white;
      border: 1px solid #ccc;
      background-color: #ccc;
      cursor: default;
    }
    &.active+.option {
      border-left: none;
    }
  }
}
</style>