<template>
  <div @click='goback' class='clickable'>
    <rbox :title='"返回"'></rbox>
  </div>
</template>

<script>
import Rbox from './Rbox.vue'

export default {
  name: 'goback',
  components: {
    'rbox': Rbox
  },
  data () {
    return {}
  },
  methods: {
    goback () {
      this.$bus.$emit('goback')
    }
  }
}
</script>

<style scoped lang="scss">
.clickable {
  cursor: pointer;
}
</style>