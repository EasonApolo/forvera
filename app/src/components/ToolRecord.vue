<template>
  <layout>
    <template #main>
      <list>
        <template #list>
          <div class='item audio'>
            <audio :src="rec.src" controls></audio>
          </div>
          <div class="item description" v-if="rec.src">
            {{rec.date}}<br>{{rec.description}}
          </div>
        </template>
      </list>
    </template>
    <template #right>
      <goback></goback>
      <rbox :title='"播放列表"'>
        <template #list>
          <div v-for="(r, index) in reclist" :key="index" class="item" @click="play(r, index)" :class="{active:active===index}">
            <span>{{r.title}}</span>
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

let fetchJsonp = require('fetch-jsonp')

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
      active: -1,
      // rec
      reclist: [],
      rec: {
        src: '',
        date: '',
        description: ''
      },
      ip: {
        kList: 'http://node.kg.qq.com/cgi/fcgi-bin/kg_ugc_get_homepage?type=get_uinfo&start=1&num=5&share_uid=66959d8024253189',
        kDetail: 'http://cgi.kg.qq.com/fcgi-bin/kg_ugc_getdetail?inCharset=GB2312&outCharset=utf-8&v=4&shareid='
      }
    }
  },
  created () {
    this.fetchRecList()
  },
  beforeDestroy () {
    this.recsrc = ''
    this.recdescription = ''
  },
  methods: {
    fetchRecList () {
      // console.log(window.ip + 'media?media_type=audio')
      // fetch(window.ip + 'media?media_type=audio')
      // .then(res => {
      //   return res.json()
      // }).then(json => {
      //   this.reclist = json
      // })
      fetchJsonp(this.ip.kList, {
        jsonpCallbackFunction: 'MusicJsonCallback'
      })
      .then(res => res.json()).then(json => {
        this.reclist = json.data.ugclist.map(
          // use () so that {} won't be mistaken for a segment
          v => ({type:1, title:v.title, id:v.shareid})
        )
      })
    },
    play (rec, index) {
      this.active = index
      if (rec.type == 0) {
        this.rec.src = this.reclist[index].source_url
        this.rec.description = this.reclist[index].description.rendered.split(/<p>|<\/p>/).slice(-2, -1)[0]
        this.rec.date = this.reclist[index].date.split('T').join(' ').slice(0, -3)
      } else if (rec.type == 1) {
        fetchJsonp(this.ip.kDetail + this.reclist[index].id, {
          jsonpCallbackFunction: 'jsonpcallback'
        }).then(res => res.json()).then(json => {
          this.rec.src = json.data.playurl
          this.rec.description = json.data.singer_name
          this.rec.date = new Date(json.data.ctime*1000).toISOString().split('T').join(' ').slice(0, -8)
        })
      }
    },
  }
}
</script>

<style scoped lang="scss">
.audio {
  text-align: center;
}
.description {
  color: #888;
  text-align: left;
}
</style>