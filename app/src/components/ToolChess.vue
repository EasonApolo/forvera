<template>
  <layout>
    <template #main>
      <list>
        <template #list>
          <a class='item' href='http://forvera.me/chess'>启动！</a>
        </template>
      </list>
    </template>
    <template #right>
      <goback></goback>
      <rbox :title='"尚未完工"'>
      </rbox>
    </template>
  </layout>
</template>


<script>
import Goback from './Goback.vue'
import Layout from './Layout.vue'
import List from './List.vue'
import Rbox from './Rbox.vue'

export default {
  name: 'ToolChess',
  components: {
    'goback': Goback,
    'layout': Layout,
    'list': List,
    'rbox': Rbox,
  },
  data () {
    return {
    }
  },
  created () {
  },
  methods: {
  }
}
</script>

<style lang="scss">
</style>