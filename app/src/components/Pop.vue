<template>
  <div class="pop" :style="{right:getRight,left:getLeft,opacity:getOpacity}">
    {{mes}}
  </div>
</template>

<script>
export default {
  name: 'pop',
  data () {
    return {
      mes: '',
      queue: [],
      t: undefined,
      t_a: 20,
      t_s: 100,
    }
  },
  mounted () {
    this.$bus.$on('pop', this.handler)
  },
  computed: {
    getRight () {
      let a = this.t_a
      if (this.t == undefined) return '100%'
      if (this.t < a) return ((a-this.t)**3/80)+'%'
      else return '0'
    },
    getLeft () {
      let a = this.t_a
      let d = this.t_s + 2 * a
      if (this.t == undefined || this.t < (d - a)) return '0'
      else return ((this.t+a-d)**3/80)+'%'
    },
    getOpacity () {
      if (this.t == undefined) return 0
      else if (this.t < this.t_a) return this.t/this.t_a
      else if (this.t > this.t_s + this.t_a) return (this.t_s+2*this.t_a-this.t)/this.t_a
      else return 1
    },
  },
  methods: {
    handler: function (mes) {
      this.queue.push(mes)
    },
    show: function (mes) {
      this.mes = mes
      this.t = 0
      requestAnimationFrame(this.animation)
    },
    animation: function () {
      if (this.t > this.t_s+2*this.t_a) {
        this.t = undefined
        this.queue.shift()
      } else {
        this.t ++
        requestAnimationFrame(this.animation)
      }
    }
  },
  watch: {
    'queue': function () {
      if (this.queue.length > 0 && this.t == undefined) {
        this.show(this.queue[0])
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.pop {
  position: fixed;
  display: block;
  top: 0;
  left: 0;
  right: 100%;
  padding: .125rem 0;
  z-index: 1;
  font-size: .875rem;
  overflow: hidden;
  background-color: #f1f1ff;
}
.show {
  display: block;
}
</style>