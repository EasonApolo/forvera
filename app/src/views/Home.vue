<template>
  <div class="home">
    <layout>
      <template #main>
        <list :loading='locked'>
          <template #list>
            <div class="item hover" v-for="p in posts" :key="p._id" @click="toPost(p._id)">
              <div class="title">
                <span v-html='p.title'></span>
                <span class="time">{{ slicedDate(p.updated_time) }}</span>
              </div>
              <div class="content">
                {{ p.description }}
              </div>
            </div>
          </template>
        </list>
        <div class="nav">
          <span @click="setPage(page-1)" class="pre" :class="{disable:isPage(page-1)}">上一页</span>
          <span v-for="n in shownPages" :key="n" :class="{active:n==page}" @click="setPage(n)" class="nav-digit">{{ n }}</span>
          <span @click="setPage(page+1)" class="post" :class="{disable:isPage(page+1)}">下一页</span>
        </div>
      </template>
      <template #right>
        <rbox title='分类'>
          <template #list>
            <div class='item' v-for="c in cats" :key="c.id" @click="setCat(c)" :class="{disabled:locked,active:(c._id===active_cat)}">
              {{c.title}} ({{c.count}})
            </div>
          </template>
        </rbox>
      </template>
    </layout>
  </div>
</template>

<script>
import Layout from '@/components/Layout.vue'
import Rbox from '@/components/Rbox.vue'
import List from '@/components/List.vue'
import { request } from '@/shared/Request'
export default {
  name: 'home',
  data () {
    return {
      //
      posts: [],
      // category
      active_cat: undefined,
      cats: [],
      // nav
      total_count: 0,
      page: 1,
      page_count: 1,
      per_page: 5,
      // lock
      locked: false,
    }
  },
  components: {
    'list': List,
    'layout': Layout,
    'rbox': Rbox,
  },
  mounted () {
    this.getCats()
    this.getData()
  },
  computed: {
    isPage: function () {
      return function (page_id) {
        return page_id < 1 || page_id > this.page_count
      }
    },
    shownPages: function () {
      let shown = []
      for (let i = 1; i <= this.page_count; i++) {
        if (Math.abs(i-this.page)<=3) shown.push(i)
      }
      return shown
    },
    slicedContent: function () {
      return function (content) {
        let plain = content.replace(/<[^>]*>/g, '')
        return plain.length > 147 ? plain.substring(0, 147) + '...' : plain
      }
    },
    catAndPage: function () {
      return [this.cat, this.page].join()
    },
    slicedDate: function () {
      return function (d) {
        let ds = d.split(/[-T:]/)
        ds[0] = ds[0].slice(2, 4)
        ds = ds.slice(0, -1)
        ds = ds.slice(0,3).join('-') + ' ' + ds.slice(3,5).join(':')
        return ds
      }
    },
  },
  methods: {
    toPost: function (id) {
      this.$router.push({name: 'post', params: { _id: id }})
    },
    async getCats () {
      this.cats = await request('cat')
      this.total_count = 100
    },
    async getData () {
      this.posts = await request('post')
      this.locked = false
    },
    setCat (cat) {
      if (this.locked) return
      else this.lock()
      this.active_cat = cat._id == this.active_cat ? undefined : cat._id
      this.getData()
    },
    setPage: function (page_id) {
      if (this.locked) return
      this.lock()
      if (page_id < 1 || page_id > this.page_count) {
        this.$bus.$emit('pop', '没有更多啦')
        this.unlock()
        return
      }
      this.page = page_id
      this.getData()
    },
    unlock: function () {
      this.locked = false
    },
    lock: function () {
      this.locked = true
    }
  }
}
</script>

<style scoped lang="scss">
.nav {
  margin: 2rem auto;
  width: 45%;
  height: 2rem;
  font-size: .875rem;
  span {
    position: relative;
    height: 100%;
    line-height: 2rem;
    transition: .3s ease;
    cursor: pointer;
    user-select: none;
  }
  .disable {
    opacity: .4;
  }
  .active {
    color: #aaa;
  }
  .nav-digit {
    margin: 0 .5rem;
  }
  .pre {
    float: left;
    &::before {
      content: '';
      position: absolute;
      left: -1rem;
      top: .5rem;
      height: 1rem;
      width: 1rem;
      background-image: url(../../public/left.png);
      background-size: contain;
    }
  }
  .post {
    float: right;
    &::before {
      content: '';
      position: absolute;
      right: -1rem;
      top: .5rem;
      height: 1rem;
      width: 1rem;
      background-image: url(../../public/right.png);
      background-size: contain;
    }
  }
}
@media (max-width: 1000px) {
  .nav {
    width: 85%;
  }
}
@media (min-width: 1000px) and (max-width: 1300px) {
  .nav {
    width: 65%;
  }
}
</style>