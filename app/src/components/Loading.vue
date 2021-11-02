<template>
  <div class="loading-wrapper" v-show="intSwitch==1">
    <div class="loading" :style="{transform:rotate}"></div>
  </div>
</template>

<script>
export default {
  name: 'loading',
  props: ['intSwitch'],
  data () {
    return {
      loading_deg: 0
    }
  },
  components: {
  },
  created () {
    setInterval(this.rotating, 10)
  },
  computed: {
    rotate: function () {
      return 'rotate(' + this.loading_deg + 'deg)'
    }
  },
  methods: {
    rotating: function () {
      this.loading_deg==357 ? this.loading_deg=0 : this.loading_deg += 3
    }
  }
}
</script>

<style scoped lang="scss">
.loading-wrapper {
  position: relative;
  width: 100%;
  height: 2rem;
  padding-top: 0.625rem;
  .loading {
    top: 25%;
    width: 1.25rem;
    height: 1.25rem;
    margin: 0 auto;
    background-image: url(../../public/load.png);
    background-size: contain;
    background-repeat: no-repeat;
  }
}
</style>