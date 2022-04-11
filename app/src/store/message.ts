import { defineStore } from 'pinia'
import { ip } from '../config'
import { request } from '../utils/request'

export const useMessageStore = defineStore('message', {
  state: () => {
    return {
      messages: [] as Array<Message>,
      messageInput: {
        content: '',
        files: [] as Array<File>,
        parent: '',
        ancestor: '',
        progress: 0,
      },
      messageWrapper: {
        replyToUsername: '',
        anonymous: true
      },
      page: 0,
      loading: false,
      anonymousNameList: []
    }
  },
  actions: {
    reply(message?: Message) {
      this.clearMessageInput()
      if (message) {
        this.messageInput.parent = message._id
        this.messageInput.ancestor = message.level === 0 ? message._id : message.ancestor
        this.messageWrapper.replyToUsername = message.user.username
      }
    },
    clearMessageInput() {
      this.messageInput = {
        content: '',
        files: [],
        parent: '',
        ancestor: '',
        progress: 0
      }
      this.messageWrapper.replyToUsername = ''
    },
    async fetchMessages(init = false) {
      if (init) {
        this.page = 0
        this.messages = []
      }
      if (this.loading) return
      this.loading = true
      let messages: Array<Message> = await request(`twit/${this.page}`) //, 'post', null, { upload: true, progress: this.twit.progress })
      messages.forEach(message => {
        message.files.forEach(f => {
          f.url = `${ip}${f.url}`
          f.thumb = `${ip}${f.thumb}`
        })
      })
      if (messages.length > 0) {
        this.messages.push(...messages)
        this.page++
      }
      this.loading = false
      return messages
    },
    async addMessage() {
      const { content, parent, ancestor, files } = this.messageInput
      const { anonymous } = this.messageWrapper
      const api = anonymous ? 'twit/anonymous' : 'twit'
      const fd = new FormData()
      fd.append('content', content)
      if (parent && ancestor) {
        fd.append('parent', parent)
        fd.append('ancestor', ancestor)
      }
      if (!anonymous) {
        for (let file of files) {
          fd.append('files', file)
        }
      }
      let res = await request(api, 'POST', fd, { upload: true, progress: this.messageInput })
      return res
    },
  }
})