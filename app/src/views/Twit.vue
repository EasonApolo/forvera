<template>
  <div id='twit'>
    <layout>

      <template #main>
        <list :loading=intSwitch>
          <template #list>

            <div class="twitting" v-if="twit.show">
              <div class="input">
                <v-textarea
                  class="twit-input"
                  name="twit-input"
                  label="content"
                  auto-grow
                  no-resize
                  rows="1"
                  row-height="16"
                  counter
                ></v-textarea>

                <div v-if='twit.files.length'>
                  <div class='images'>
                    <div class='image-item' v-for="(file, index) in twit.files" :key=file.name>
                      <img :src='file.data'>
                      <div id='image-control'>
                        <div class='bg'></div>
                        <div class='control' v-if='index > 0' @click='forward(index)'>←</div>
                        <div class='control' v-if='index < twit.files.length-1' @click='backward(index)'>→</div>
                        <div class='control' @click='remove(index)'>×</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="tools">
                  <v-btn>发送</v-btn>
                  <div class="placeholder"></div>
                  <v-switch class="right" v-model="twit.anonymous" :label="`匿名`" inset></v-switch>
                  <label class="right">
                    <input id='input-file' ref='inputFile' type="file" accept="image/*" @change="selectImage" multiple>
                    <v-btn @click='selectImageTrigger'>图片</v-btn>
                  </label>
                </div>

              </div>
            </div>

            <!-- <div id='new-twit'>
              <div id='new-twit-input'>
                <pre id='support' v-text='contentInPre'></pre>
                <textarea id='input' class='item' v-model='twit.content' placeholder="content"></textarea>
              </div>
              <div class='item controls'>
                <pro :progress='twit.progress.per'></pro>
                <btn @click='send()'>发送</btn>
                <sel :options='anonymousOptions' @select='changeUser'></sel>
                <label>
                  <input id='input-file' ref='inputFile' type="file" accept="image/*" @change="selectImage" multiple>
                  <btn @click='selectImageTrigger'>图片</btn>
                </label>
              </div>
            </div> -->

            <div class="item" v-for="(t, index) in data" :key="index">
              <div class='main'>
                <div class='meta'>
                  <div class="name">{{t.user.username}}</div>
                  <div class="date">{{t.created_time}}</div>
                </div>
                <div class="content" v-html="t.content" @click='replyToReply(t)'></div>
                <div class='image-display' v-if="display.twitId == t._id" @click='clearDisplay'><img :src='display.url'></div>
                <div class='images' v-if='t.files.length'>
                  <div class='image-item' v-for="f in t.files" :key=f._id @click='displayImg(t._id, f.url)'>
                    <img :src='f.thumb'>
                  </div>
                </div>
              </div>
              <div class='op'>
                <!-- <div class='show-replies'>
                </div> -->
              </div>
              <div class='replies'>
                <div class='wrapper'>
                  <div v-for='r in t.descendants' :key='r._id' class='reply-entry' @click='replyToReply(r)'>
                    <div class='name'>{{ r.user.username }}</div><div class='name' v-if='replyParentName(r)'> &gt; {{ replyParentName(r) }}</div>:
                    <div class='content'>{{ r.content }}</div>
                  </div>
                </div>
                <div class='reply' v-if='reply.ancestor == t._id'>
                  <v-textarea class="input" v-model="reply.content" :label="replyPlaceHolder" no-resize auto-grow rows="1"></v-textarea>
                  <v-btn class='send' @click='sendReply()' rounded small>发送</v-btn>
                </div>
              </div>
              <!-- <div class="opmenu">
                <div class='comments' @click='setReplyTo(item)'>
                  <div class='icon' style='width:1.25rem'></div>
                  <div class='num'>{{item.child.length === 0 ? '' : item.child.length}}</div>
                </div>
                <div class='addreact'>＋
                  <div class='list'>
                    <div class='addreact-item' v-for="(val, key) in map" :key="val" @click='react(item, key)'>{{val}}</div>
                  </div>
                </div>
                <div class='react'>
                  <div v-for='(val, key) in itemReact(item)' :key='key' class='added'>
                    {{map[key]}}{{val}}
                  </div>
                </div>
              </div>
              <div v-for="(child, index) in item.child" :key='index' class="item item-child">
                <div class='meta'>
                  <div class="name">{{child.author_name}}</div>
                  <div class="date">{{slicedDate(child.date)}}</div>
                </div>
                <div class="content" v-html="child.content.rendered" @click="clickbub($event)"></div>
              </div> -->
            </div>

          </template>
        </list>
      </template>

    </layout>
  </div>
</template>

<script>
import Layout from '@/components/Layout.vue'
import Rbox from '@/components/Rbox.vue'
import List from '@/components/List.vue'
import Loading from '@/components/Loading.vue'
import { Button, Progress } from '@/components/Button.js'
import { mapGetters } from 'vuex'
import { readFile } from '@/shared/helper'
import { request } from '../shared/Request'
import { ip } from '@/shared/config'
import Select from '@/components/Select.vue'

export default {
  name: 'twit',
  data () {
    return {
      twit: {
        show: false,
        content: '',
        files: [],
        parent: null,
        ancestor: null,
        progress: {
          per: 0
        },
        anonymous: true,
      },
      data: [],
      curPage: 0,
      intSwitch: 0,
      mainNode: undefined,
      listNode: undefined,
      display: { twitId: null, url: null },
      data: [],
      max_page: 101,
      addOpen: false,
      large_device: true,
      reactdata: [],
      toParent: 0,
      reply: {
        content: '',
        parent: null,
        ancestor: null,
        parentName: null,
        replyToContent: '',
      },
      replies: [],
      twitShowReplies: null,
      map: {
        'gd': '🉑',
        'zn': '👍',
        'sh': '💩',
        'nm': '🍋',
        'ca': '👎',
        'wh': '❓',
        'ha': '🐸',
        'gt': '❗',
        'hp': '😨',
        'dg': '🐶',
        'tt': '🍭',
        'qq': '😘'
      },
    }
  },
  components: {
    'layout': Layout,
    'rbox': Rbox,
    'list': List,
    'btn': Button,
    'pro': Progress,
    'sel': Select,
  },
  created () {
    this.fetchTwits(this.curPage)
    this.setDevice()
    window.addEventListener('resize', () => {
      this.setDevice()
    })
  },
  mounted () {
    this.mainNode = document.getElementsByClassName('main')[0]
    this.mainNode.addEventListener('scroll', this.scrollBottom)
    this.listNode = document.getElementsByClassName('list')[0]
  },
  computed: {
    anonymousOptions () {
      const displayUserName = this.$store.state.login ? this.userInfo.username : '未登录'
      return [
        { name: 'anonymous', value: '匿名', default: true },
        { name: 'username', value: displayUserName, disabled: !this.$store.state.login },
      ]
    },
    replyParentName () { 
      return function (r) { return r.parent?.username }
    },
    replyPlaceHolder () { return `回复给${ this.reply.parentName } : ${ this.reply.replyToContent }` },
    sendTwitUserName () { return this.twit.anonymous ? 'anonymous' : this.userInfo.username },
    contentInPre () {
      // I met strange problem, last newline in PRE not showing, so add an extra newline manually.
      return this.twit.content + '\n'
    },
    toParentName () {
      let item = this.data.find(v => v.id === this.toParent)
      return item === undefined ? '' : item.author_name
    },
    userInfo () { return this.$store.getters.userInfo },
    itemReact () {
      return (item) => {
        let pair = this.reactdata.find(v => v.id == item.id)  // v.id is str, use ==
        return pair === undefined ? [] : pair.react
      }
    },
    slicedContent () {
      return function (content) {
        let plain = content.replace(/<[^>]*>/g, '')
        return plain
      }
    },
    slicedDate () {
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
    forward (index) {
      let files = this.twit.files
      if (index > 0) {
        const f = files.splice(index, 1)
        files.splice(index - 1, 0, ...f)
      }
      console.log(files)
    },
    backward (index) {
      let files = this.twit.files
      if (index < files.length - 1) {
        const f = files.splice(index, 1)
        files.splice(index + 1, 0, ...f)
      }
    },
    remove (index) {
      this.twit.files.splice(index, 1)
    },
    selectImageTrigger () {
      this.$refs.inputFile.click()
    },
    async selectImage () {
      if (!this.$refs.inputFile.files?.length && this.twit.files.length >= 3) return
      const inputFiles = [...this.$refs.inputFile.files]
      let fileObjs = await Promise.all(
        inputFiles.map(
          async f => {
            return { data: await readFile(f), blob: f }
          }
        )
      )
      this.twit.files.push(...fileObjs)
    },
    fetchReact () {
      fetch(window.domain + '/react/react.php')
      .then(res => {return res.json()})
      .then(json => {
        this.reactdata = json
      })
    },
    react (item, key) {
      let react
      if (item.meta.react === '') {
        react = {}
      } else {
        react = item.meta.react
      }
      if (key in react) {
        react[key] = react[key] + 1
      } else {
        react[key] = 1
      }
      item.meta.react = react
      let react_str = JSON.stringify(react)
      let form = new FormData()
      form.append('id', item.id)
      form.append('rid', key)
      fetch(window.domain + '/react/react.php', {
        method: 'POST',
        body: form
      })
      .then(res => {return res.json()})
      .then(json => {
        this.reactdata = json
      })
    },
    scrollBottom () {
      if (this.$route.path != '/twit') return
      if (this.intSwitch == 0 && this.mainNode.scrollTop + this.mainNode.clientHeight >= this.listNode.clientHeight + 48) {
        let pageToFetch = Math.ceil(this.data.length / 10.0 + 1)
        this.fetchTwits(pageToFetch)
      }
    },
    clickbub (e) {
      if (e.target.nodeName === 'IMG') {
        if (e.target.style.maxWidth === '100%') {
          e.target.style.maxWidth = '30%'
        } else {
          e.target.style.maxWidth = '100%'
        }
      }
    },
    setReplyTo (item) {
      this.toParent = item.id
      if (!this.large_device) {
        this.addOpen = true
      }
    },
    setDevice () {
      this.large_device = document.documentElement.clientWidth > 750 
    },
    clearComment () {
      this.data = []
      this.max_page = 1000
    },
    clearDisplay () {
      this.display = { twitId: null, url: null }
    },
    displayImg (twitId, url) {
      this.display.twitId = twitId
      this.display.url = url
    },
    async fetchTwits (page) {
      let twits = await request(`twit/${ page }`, null, null, { upload: true, progress: this.twit.progress })
      this.handleTwits(twits)
      this.data.push(...twits)
    },
    handleTwits (twits) {
      const handler = t => {
        const date = new Date(t.created_time)
        t.content = t.content.replace(/\n/g, '<br>')
        t.created_time = `${ date.toLocaleDateString() } ${ date.toLocaleTimeString(undefined, {hour12: false}) }`
        t.files.map(f => { 
          f.url = `${ ip }${ f.url }`;
          f.thumb = `${ ip }${ f.thumb }`;
        })
        this.handleDescendants(t)
        return t
      }
      if (Array.isArray(twits)) return twits.map(handler)
      else return handler(twits)
    },
    handleDescendants (t) {
      for (let i in t.descendants) {
        let r = t.descendants[i]
        if (r.parent != t._id) {
          let p = t.descendants.find(d => d._id == r.parent)
          let username = p?.user.username || undefined
          r.parent = { _id: r.parent, username }
        }
      }
      console.log(t.descendants.map(r => r.parent))
    },
    replyToReply (reply) {
      this.reply.parent = reply._id
      this.reply.ancestor = reply?.ancestor || reply._id
      this.reply.parentName = reply.user.username
      this.reply.replyToContent = reply.content
    },
    fetchChildComments (allparent) {
      fetch(window.ip + 'comments?post=' + 53 + '&parent=' + allparent.join(','))
      .then(res => {return res.json()})
      .then(json => {
        json.map(v => {
          for (let i in this.data) {
            if (this.data[i].id === v.parent) {
              if (this.data[i].child === undefined) {
                this.data[i].child = [v]
              } else {
                this.data[i].child.push(v)
              }
            }
          }
        })
      })
    },
    async sendReply () {
      let r = this.reply
      if (r.content.length < 1 || !r.ancestor || !r.parent) {
        this.$store.commit('notify', { content: '内容不能为空' }); return;
      }
      this.$store.commit('notify', { content: '发送中' })
      let fd = new FormData()
      fd.append('content', this.reply.content)
      fd.append('parent', this.reply.parent)
      fd.append('ancestor', this.reply.ancestor)
      const api = this.twit.anonymous ? 'twit/anonymous' : 'twit'
      let newAncestorTwit = await request(api, 'POST', fd)
      let ancestorIndex = this.data.findIndex(t => t._id == newAncestorTwit._id)
      console.log(ancestorIndex)
      this.data.splice(ancestorIndex, 1, this.handleTwits(newAncestorTwit))
      this.$store.commit('notify', { content: '发送成功' })
    },
    changeUser (name) {
      this.twit.anonymous = name == 'anonymous'
    },
    async send () {
      let t = this.twit
      if (t.content == '') { this.$store.commit('notify', { content: '内容不能为空' }); return; }
      this.$store.commit('notify', { content: '发送中' })
      let fd = new FormData()
      fd.append('content', t.content)
      if (!t.anonymous) {
        t.files.map(f => fd.append('files', f.blob))
      }
      const api = t.anonymous ? 'twit/anonymous' : 'twit'
      let newTwit = await request(api, 'POST', fd, { upload: true, progress: this.twit.progress })
      this.data.unshift(this.handleTwits(newTwit))
      this.$store.commit('notify', { content: '发送成功' })
      this.twit.progress.per = 0
    },
    toggleAnonymous () {
      if (this.$store.state.login) {
        this.twit.anonymous = !this.twit.anonymous
      } else {
        this.$store.commit('notify', { content: '登录后可以使用用户名发言' })
      }
    }
  }
}
</script>

<style scoped lang="scss">
.twitting {
  position: fixed;
  width: 40rem;
  bottom: 3.5rem;
  z-index: 1;
  .input {
    margin: 0 auto;
    padding: .5rem 1rem;
    width: 36rem;
    max-height: 20rem;
    overflow-y: scroll;
    background: white;
    border-radius: .75rem;
    box-shadow: 0 0 10px 1px #e8e8e8;
    .tools {
      display: flex;
      align-items: center;
      .placeholder {
        flex: 1 1 auto;
      }
      .right {
        margin-left: 1rem;
      }
      #input-file {
        display: none;
      }
    }
  }
}
#new-twit {
  .item {
    border: none;
    border-top: 1px solid #eee;
  }
  #new-twit-input {
    position: relative;
    #support {
      margin: 0;
      padding: .5rem 1rem;
      min-height: 1.25rem;
      visibility: hidden;
      border-top: 1px solid transparent;
      word-wrap: break-word;
      white-space: pre-wrap;
      font-size: .875rem;
      text-align: left;
      font-family: inherit;
      line-height: 1.25rem;
    }
    #input {
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      border-bottom: none;
      min-height: 1.25rem;
      height: calc(100% - 1rem - 1px);
      overflow: hidden;
    }
  }
  #input-file {
    display: none;
  }
  .controls {
    display: flex;
    & > div {
      margin-right: 1rem;
    }
  }
}
.images {
  display: grid;
  grid-template-columns: repeat(auto-fill, 6rem);
  grid-gap: .5rem;
  width: calc(100% - 1rem);
  .image-item {
    position: relative;
    overflow: hidden;
    border-radius: .5rem;
    img {
      display: block;
      width: 100%;
    }
    &:hover #image-control {
      opacity: 1;
    }
    #image-control {
      position: absolute;
      right: .25rem;
      top: .25rem;
      border-radius: .5rem;
      opacity: 0;
      overflow: hidden;
      transition: opacity .2s ease-in-out;
      .bg {
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: .5rem;
        background-color: white;
        opacity: .7;
        backdrop-filter: blur(30px);
      }
      .control {
        position: relative;
        display: inline-block;
        width: 1.5rem;
        height: 1.5rem;
        line-height: 1.5rem;
        text-align: center;
        transition: background-color .2s ease;
        &:hover {
          background-color: #eee;
          opacity: .5;
        }
      }
    }
  }
}
.item{
  padding: .5rem 0;
  .main {
    .meta {
      height: 1.5rem;
      .name, .date {
        display: inline-block;
        margin: 0 1rem 0 0;
        font-size: .9375rem;
      }
      .name {
        font-weight: bold;
      }
      .date {
        color: #999;
        font-size: .8125rem;
      }
    }
    .content {
      position: relative;
      padding: .25rem 0;
      font-size: 0.875rem;
      line-height: 1.5rem;
      word-break: break-all;
      border-radius: .3125rem;
      transition: background-color .2s ease;
      cursor: pointer;
      &:hover {
        background-color: #f6f6f6;
      }
    }
    .image-display {
      width: calc(100% - 1rem);
      background-color: #eee;
      img {
        display: block;
        margin: 0 auto;
        max-width: 100%;
      }
    }
  }
  .op {
    .show-replies {
      width: 1.25rem;
      height: 1.25rem;
      background-image: url('../../public/reply.svg');
      background-size: contain;
      cursor: pointer;
    }
  }
  .opmenu {
    margin-top: .5rem;
    display: flex;
    height: 1.25rem;
    line-height: 1.25rem;
    color: #888;
    font-size: 15px;
    user-select: none;
    .comments {
      flex: 0 0 auto;
      width: 3rem;
      cursor: pointer;
      .icon {
        display: inline-block;
        height: 20px;
        vertical-align: middle;
      }
      .num {
        display: inline-block;
        margin-left: .25rem;
        height: 20px;
        vertical-align: middle;
      }
    }
    .addreact {
      position: relative;
      flex: 0 0 auto;
      width: 2rem;
      font-size: 16px;
      cursor: pointer;
      text-align: center;
      &:hover .list {
        display: flex;
      }
      .list {
        position: absolute;
        display: none;
        flex-wrap: wrap;
        padding: .5rem;
        width: 8rem;
        background-color: white;
        border: 1px solid #ddd;
        border-radius: .5rem;
        cursor: pointer;
        z-index: 1;
        .addreact-item {
          flex: 0 0 auto;
          width: 2rem;
          height: 2rem;
          line-height: 2rem;
          text-align: center;
        }
      }
    }
    .react {
      position: relative;
      display: flex;
      flex: 1 1 auto;
      height: 1.5rem;
      vertical-align: top;
      flex-wrap: nowrap;
      overflow-x: scroll;
      &::-webkit-scrollbar {
        display: none;
      }
      .added {
        flex: 0 1 auto;
        margin-right: .75rem;
        text-align: center;
        white-space: nowrap;
      }
    }
  }
  .replies {
    .reply {
      display: flex;
      align-items: center;
      position: relative;
      margin-top: .25rem;
      .input {
        margin-right: 1rem;
        font-size: .375rem;
      }
    }
    .wrapper {
      .reply-entry {
        padding: .0625rem .5rem;
        border-radius: .3125rem;
        cursor: pointer;
        &:hover {
          background-color: #f6f6f6;
          transition: .2s ease;
        }
        .name {
          display: inline;
          font-size: .8125rem;
        }
        .content {
          display: inline;
          margin-left: .25rem;
          font-size: .8125rem;
        }
      }
    }
  }
}
</style>