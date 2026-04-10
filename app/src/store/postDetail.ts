import { defineStore } from 'pinia'
import { parse } from '../utils/markdown'
import { usePostStore } from './post'
import { rewriteContentImagesForViewer } from '@/components/imageViewer'

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
      this.post.content = this.replaceUrl(this.post.content)
      this.post.content = parse(this.post.content)
    },
    replaceUrl(html: string) {
      return rewriteContentImagesForViewer(html)
    },
    clear() {
      this.post = {} as Post
    },
  },
})
