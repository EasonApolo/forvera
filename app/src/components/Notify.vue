<template>
  <div id='wrapper' :class='{active:active}'>
    <div id='el' :class='{warning:typeWarning}'>
      > {{ content }}
      <btn id='confirm' :size=0 :mr=0 v-if="isConfirm" @click='confirm'>确认</btn>
    </div>
  </div>
</template>

<script>
import { Button } from '@/components/Button.js'
export default {
  name: 'notify',
  components: { 'btn': Button },
  data () {
    return {
      content: '',
      type: undefined,
      active: false,
      activeHandler: undefined,
      activeDuration: 2500,
    }
  },
  mounted () {
  },
  computed: {
    note () { return this.$store.state.note },
    typeWarning () { return this.type == 'warning' },
    isConfirm () { return this.note.confirm !== undefined },
  },
  methods: {
    confirm () {
      this.$store.commit('confirm')
    },
  },
  watch: {
    note (_new, _old) {
      if (_new.content) {
        this.content = _new.content
        this.type = _new?.type
        this.active = true
        if (this.activeHandler) clearTimeout(this.activeHandler)
        this.activeHandler = setTimeout(() => { 
          this.active = false
          this.$store.commit('clearNote')
        }, this.activeDuration)
      } else {
        // 如果其它地方clearNote，这个组件也会关闭。
        if (this.activeHandler) clearTimeout(this.activeHandler)
        this.active = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
#wrapper {
  position: fixed;
  left: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  z-index: 1;
  transform: translateY(-3rem);
  transition: all .3s ease;
  #el {
    margin-top: .5rem;
    padding: .25rem 1rem;
    width: 16rem;
    height: 1.5rem;
    text-align: left;
    border-radius: .5rem;
    color: #666;
    font-size: .875rem;
    line-height: 1.5rem;
    background-color: #F1F1FF;
    box-shadow: 0px 1px 6px 1px #ddd;
    &.warning {
      background-color: #ebb;
    }
  }
  #confirm {
    float: right;;
  }
  &.active {
    transform: translateY(0);
  }
}
</style>