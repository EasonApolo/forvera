import { defineStore } from 'pinia'
import { ip } from '../config'
import { request } from '../utils/request'

export const useMainStore = defineStore('main', {
  state: () => {
    return {
      loginData: {
        username: undefined,
        password: undefined
      },
      userInfo: {
        username: undefined,
        token: undefined
      },
      posts: [],
      messages: [] as Array<Message>,
      messageInput: {
        content: '',
        files: [] as Array<File>,
        parent: '',
        ancestor: '',
        progress: 0,
      },
      messageWrapper: {
        show: false,
        replyToUsername: '',
        anonymous: true
      }
    }
  },
  getters: {
    isLogin: state => !!state.userInfo.token
  },
  actions: {
    async login() {
      const payload = this.loginData
      let { token } = await request('auth/login', 'POST', JSON.stringify(payload))
      if (token) {
        Object.assign(this.userInfo, { token, username: this.loginData.username })
      }
    },
    async fetchPosts() {
      this.posts = await request('post')
    },
    async fetchMessages() {
      const page = 0
      let messages: Array<Message> = await request(`twit/${page}`) //, 'post', null, { upload: true, progress: this.twit.progress })
      messages.forEach(message => {
        message.files.forEach(f => {
          f.url = `${ip}${f.url}`
          f.thumb = `${ip}${f.thumb}`
        })
        this.messages = messages
      })
    },
    async addMessage() {
      const { content, parent, ancestor, files } = this.messageInput
      const api = this.messageWrapper.anonymous ? 'twit/anonymous' : 'twit'
      const fd = new FormData()
      fd.append('content', content)
      if (parent && ancestor) {
        fd.append('parent', parent)
        fd.append('ancestor', ancestor)
      }
      for (let file of files) {
        fd.append('files', file)
      }
      let res = await request(api, 'POST', fd, { upload: true, progress: this.messageInput })
      console.log(res)
    },
    async addReply() {
      // let fd = new FormData()
      // fd.append('content', this.reply.content)
      // fd.append('parent', this.reply.parent)
      // fd.append('ancestor', this.reply.ancestor)
      // const api = this.twit.anonymous ? 'twit/anonymous' : 'twit'
      // let newAncestorTwit = await request(api, 'POST', fd)
    }
  }
})