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
        anonymous: true,
      },
      loading: false,
      anonymousNameList: [],
    }
  },
  actions: {
    reply(message?: Message) {
      this.clearMessageInput()
      if (message) {
        this.messageInput.parent = message._id
        this.messageInput.ancestor =
          message.level === 0 ? message._id : message.ancestor
        this.messageWrapper.replyToUsername = message.user.username
      }
    },
    clearMessageInput() {
      this.messageInput = {
        content: '',
        files: [],
        parent: '',
        ancestor: '',
        progress: 0,
      }
      this.messageWrapper.replyToUsername = ''
    },
    async fetchMessages(isLogin: boolean) {
      this.messages = []
      if (this.loading) return
      this.loading = true
      const url = isLogin ? `twit/list` : `twit/list/anonymous`
      const method = isLogin ? 'POST' : 'GET'
      let messages: Array<Message> = await request(`${url}`, method) //, 'post', null, { upload: true, progress: this.twit.progress })
      messages = this.processMessages(messages)
      if (messages.length > 0) {
        this.messages.splice(0, this.messages.length, ...messages)
      }
      this.loading = false
      return messages
    },
    processMessages(messages: Message | Message[]): Message[] {
      if (!Array.isArray(messages)) {
        messages = [messages]
      }
      messages = messages.filter(message => message.user !== null)
      messages.forEach(message => {
        message.files.forEach(f => {
          f.url = `${ip}${f.url}`
          f.thumb = `${ip}${f.thumb}`
        })
      })
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
      // let res = await request(api, 'POST', fd, { upload: true, progress: this.messageInput })
      let newMessage = await request(api, 'POST', fd)
      this.processMessages(newMessage)
      if (!this.messageInput.ancestor) {
        this.messages.unshift(newMessage)
      } else {
        const ancestorIndex = this.messages.findIndex(
          m => m._id === this.messageInput.ancestor
        )
        this.messages.splice(ancestorIndex, 1, newMessage)
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      return newMessage
    },
    async deleteMessage(messageId: string) {
      const res: Message = await request(`twit/${messageId}`, 'DELETE')
      if (res) {
        // 删除reply，返回更新后的祖先message
        const updatedIndex = this.messages.findIndex(m => m._id !== res._id)
        this.messages.splice(updatedIndex, 1, res)
      } else {
        // 删除祖先message，返回null
        this.messages = this.messages.filter(m => m._id !== messageId)
      }
      return res
    }
  },
})
