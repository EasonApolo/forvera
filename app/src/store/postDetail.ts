import { defineStore } from 'pinia'
import { parse } from '../utils/markdown'
import { usePostStore } from './post'

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
      this.post.content = parse(this.post.content)
    },
    clear() {
      this.post = {} as Post
    }
  }
})