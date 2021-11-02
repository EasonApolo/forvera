<template>
  <layout>
    <template #main>
      <list>
        <template #list>
          <div class="item" v-for="(d, index) in data" :key='index' @click="open(d.Url)">
            <div class='title'>{{d.Title}}</div>
            <div class='heat' v-if='d.hotDesc'>{{d.hotDesc}}</div>
            <div class='date'>{{getDate(d)}}</div>
          </div>
        </template>
      </list>
    </template>
    <template #right class="right m-suspend">
      <goback></goback>
      <rbox :title='"Sites"'>
        <template #list>
          <div v-for="(s, index) in sites" :key="index" class="item" @click="fetchData(s[0], index)" :class="{active:active===index}">
            <span>{{s[1]}}</span>
            <div class='up' v-if="index>0" @click.stop='setDefaultSites(index)'></div>
          </div>
        </template>
      </rbox>
      <rbox :title='"Reference"'>
        <template #list>
          <div class="item" @click='open("https://github.com/tophubs/TopList")'>
            数据接口来自：<br>
            https://github.com/tophubs/TopList<br>
            https://mo.fish/main/home/hot<br>
          </div>
        </template>
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
  name: 'ToolRecord',
  components: {
    'goback': Goback,
    'layout': Layout,
    'list': List,
    'rbox': Rbox,
  },
  data () {
    return {
      active: 0,
      data: [],
      sites: [[1, '知乎'], [59, 'V2EX'], [2, '虎扑'], [106, 'NGA'], [58, '微博'], [8, '虎嗅'], [12, '36Kr'], [112, 'IT之家']],
      savedData: {},
    }
  },
  created () {
    if (localStorage.sites != undefined) {
      this.sites = JSON.parse(localStorage.sites)
    }
    this.fetchData(this.sites[this.active][0], this.active)
  },
  beforeDestroy () {
  },
  computed: {
    getDate: function () {
      return data => {
        if (data.CreateTime) {
          return (new Date(data.CreateTime*1000)).toISOString().split('T').join(' ').slice(0, -8)
        } else {
          return data.Url
        }
      }
    }
  },
  methods: {
    fetchData (id, index) {
      this.active = index
      if (this.savedData[id] != undefined) {
        this.data = this.savedData[id]
      } else {
        fetch(`https://api.tophub.fun/v2/GetAllInfoGzip?id=${id}&page=0`)
        .then(res => {
          return res.json()
        }).then(json => {
          this.data = json.Data.slice(0,20)
          this.savedData[id] = this.data
        })
      }
    },
    setDefaultSites (index) {
      this.sites.unshift(this.sites.splice(index, 1)[0])
      this.fetchData(this.sites[this.active][0], this.active)
      localStorage.sites = JSON.stringify(this.sites)
    },
    open (url) {
      window.open(url, '_blank')
    },
  }
}
</script>

<style scoped lang="scss">
.item {
  display: flex;
  flex-wrap: wrap;
  .title {
    flex: 0 0 auto;
    margin-bottom: .5rem;
    width: 100%;
    font-size: .875rem;
    font-weight: normal;
  }
  .date {
    flex: 1 1 auto;
    text-align: right;
  }
  .heat {
    flex: 0 0 auto;
    width: 10rem;
  }
  .date, .heat {
    color: #aaa;
    font-size: 12px;
  }
}
@media (max-width: 750px) {
  .m-suspend {
    .m-bar {
      .ritem {
        .up {
          display: none !important;
        }
      }
    }
    .m-hidden {
      display: none;
    }
  }
}
</style>