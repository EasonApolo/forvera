<template>
  <div class="cats">
    <layout>
      <template #main>
        <list>
          <template #list>
            <div class='item'>查看 / 管理文章类别</div>
            <div class='item' v-if='!showEdit'>
              <btn @click='showEdit=true'>添加</btn>
            </div>
            <template v-else>
              <textarea class='item' v-model='title' placeholder='分类名'></textarea>
              <textarea class='item' v-model="description" placeholder="描述"></textarea>
              <div class='item controls'>
                <btn @click='submit'>确定</btn>
                <btn @click='cancel'>取消</btn>
                <btn @click='deleteCat' class='to-right' v-show="target">删除</btn>
              </div>
            </template>
            <div class='item' v-if='cats.length==0'>还没有分类</div>
            <div class='item' v-else v-for='c in cats' :key='c._id'>
              <span class='name'>{{ c.title }}</span>
              <span class='description'>{ {{ c.description }} }</span>
              <btn class='to-right' @click='modify(c)' :size='0'>修改</btn>
            </div>
          </template>
        </list>
      </template>
      <template #right>
        <rbox title=''>
          <template #list>
          </template>
        </rbox>
      </template>
    </layout>
  </div>
</template>

<script>
import Layout from '@/components/Layout.vue'
import List from '@/components/List.vue'
import Rbox from '@/components/Rbox.vue'
import { request } from '@/shared/Request'
import { Button } from '@/components/Button.js'

export default {
  name: 'cats',
  data () {
    return {
      cats: [],
      title: '',
      description: '',
      showEdit: false,
      target: undefined,
    }
  },
  components: {
    'layout': Layout,
    'list': List,
    'rbox': Rbox,
    'btn': Button,
  },
  computed: {
    loginStatus () { return this.$store.state.login }
  },
  mounted () {
    this.init()
  },
  methods: {
    async init () {
      this.cats = await request('cat')
    },
    async submit () {
      if (this.title.length == 0) { return }
      let payload = JSON.stringify({
        title: this.title, description: this.description
      });
      let res
      if (this.target == undefined) {
        res = await request('cat', 'POST', payload)
      } else {
        res = await request(`cat/${ this.target }`, 'PUT', payload)
      }
      this.updateCats(res.data)
    },
    async deleteCat () {
      let res = await request(`cat/${ this.target }`, 'DELETE')
      this.updateCats(res.data)
    },
    updateCats (data) {
      this.title = this.description = ''
      this.target = undefined
      this.cats = data
      this.showEdit = false
    },
    cancel () {
      this.title = this.description = ''
      this.target = undefined
      this.showEdit = false
    },
    modify (cat) {
      ({ _id: this.target, title: this.title, description: this.description} = cat);
      this.showEdit = true
    }
  },
  watch: {
    loginStatus (status) {
      if (status) this.init()
    }
  }
}
</script>

<style scoped lang="scss">
.controls {
  div {
    margin-right: 1rem;
  }
}
.name {
  font-size: .875rem;
}
.description {
  margin-left: 1rem;
  color: #666;
  font-size: .75rem;
}
.to-right {
  margin: 0 0 0 1rem !important;
  float: right;
}
</style>