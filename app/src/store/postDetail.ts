import { defineStore } from 'pinia'
import { parse } from '../utils/markdown'
import { usePostStore } from './post'
import { ip } from '@/config'

export const usePostDetail = defineStore('detail', {
  state: () => {
    return {
      post: {} as Post,
    }
  },
  actions: {
    async init(postId: string) {
      const postStore = usePostStore()
      this.post = await postStore.fetchPostById(postId)
      console.log('test')
      this.post.content = this.replaceUrl(this.post.content)
      this.post.content = parse(this.post.content)
    },
    replaceUrl(html: string) {
      const regex = /<img src="(https?:\/\/[^\/]+)?(\/[^"]+)"/g
      console.log(html, html.match(regex))
      return html.replace(regex, `<img src="${ip}$2"`)
    },
    clear() {
      this.post = {} as Post
    },
  },
})
