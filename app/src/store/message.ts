import { defineStore } from 'pinia'
import { request } from '../utils/request'
import { toViewerOriginalUrl, toViewerThumbUrl } from '@/components/imageViewer'

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
        editTarget: null as Message | null,
      },
      // 按上下文存的输入草稿（仅内存，刷新页面即清空）：
      // 根发言 ''、回复 <parent id>、编辑 edit:<id>
      messageDrafts: {} as Record<string, { content: string; files: File[] }>,
      loading: false,
      anonymousNameList: [],
    }
  },
  getters: {
    // 当前输入所属的草稿上下文
    draftKey: state =>
      state.messageWrapper.editTarget
        ? `edit:${state.messageWrapper.editTarget._id}`
        : state.messageInput.parent || '',
  },
  actions: {
    /** 把当前输入存为所属上下文的草稿；内容与图片均为空则移除该草稿 */
    saveMessageDraft() {
      const key = this.draftKey
      const { content, files } = this.messageInput
      if (content.trim() || files.length) {
        this.messageDrafts[key] = { content, files: [...files] }
      } else {
        delete this.messageDrafts[key]
      }
    },
    /** 恢复当前上下文的草稿；无草稿则保持刚重置的空输入 */
    restoreMessageDraft() {
      const draft = this.messageDrafts[this.draftKey]
      if (draft) {
        this.messageInput.content = draft.content
        this.messageInput.files = [...draft.files]
      }
    },
    /** 发送成功后丢弃当前上下文的草稿 */
    discardMessageDraft() {
      delete this.messageDrafts[this.draftKey]
    },
    reply(message?: Message) {
      this.saveMessageDraft()
      this.clearMessageInput()
      if (message) {
        this.messageInput.parent = message._id
        this.messageInput.ancestor =
          message.level === 0 ? message._id : message.ancestor
        this.messageWrapper.replyToUsername = message.user.username
      }
      this.restoreMessageDraft()
    },
    editMessage(message: Message) {
      this.saveMessageDraft()
      this.clearMessageInput()
      this.messageInput.content = message.content
      this.messageWrapper.editTarget = message
      // 有未完成的编辑草稿则用草稿覆盖线上内容
      this.restoreMessageDraft()
    },
    /** 进入独立发送页：重置为根发言上下文，并恢复根发言草稿 */
    startNewMessage() {
      this.saveMessageDraft()
      this.clearMessageInput()
      this.restoreMessageDraft()
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
      this.messageWrapper.editTarget = null
    },
    async fetchMessages(isLogin: boolean, year?: number, keyword?: string) {
      this.messages = []
      if (this.loading) return
      this.loading = true
      const url = isLogin ? `twit/list` : `twit/list/anonymous`
      const method = isLogin ? 'POST' : 'GET'
      const params: any = {}
      if (year) params.year = year
      if (keyword) params.q = keyword
      let messages: Array<Message> = await request(`${url}`, method, params) //, 'post', null, { upload: true, progress: this.twit.progress })
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
        if (message.status === undefined) {
          message.status = 1
        }
        message.files.forEach(f => {
          f.url = toViewerOriginalUrl(f.url)
          f.thumb = toViewerThumbUrl(f.thumb || f.url)
        })
        message.descendants?.forEach(reply => {
          if (reply.status === undefined) {
            reply.status = 1
          }
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
      const res: Message | null = await request(`twit/${messageId}`, 'DELETE')
      if (res) {
        // 删除reply，返回更新后的祖先message
        const updatedIndex = this.messages.findIndex(m => m._id === res._id)
        if (updatedIndex !== -1) {
          this.messages.splice(updatedIndex, 1, res)
        }
      } else {
        // 删除祖先message，返回null
        this.messages = this.messages.filter(m => m._id !== messageId)
      }
      // 返回布尔值表示操作成功，避免前端误判null为失败
      return true
    },
    async updateMessageStatus(messageId: string, status: 0 | 1) {
      const res: Message = await request(`twit/${messageId}/status`, 'PUT', {
        status,
      })
      if (res) {
        const updatedIndex = this.messages.findIndex(m => m._id === res._id)
        if (updatedIndex !== -1) {
          this.messages.splice(updatedIndex, 1, res)
        }
      }
      return res
    },
    async updateMessageContent(messageId: string, content: string) {
      const res: Message = await request(`twit/${messageId}/content`, 'PUT', {
        content,
      })
      if (res) {
        this.processMessages(res)
        const updatedIndex = this.messages.findIndex(m => m._id === res._id)
        if (updatedIndex !== -1) {
          this.messages.splice(updatedIndex, 1, res)
        }
      }
      return res
    }
  },
})
