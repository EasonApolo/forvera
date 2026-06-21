import { defineStore } from 'pinia'
import { ip } from '../config'
import { request } from '../utils/request'
import { useCategories } from './category'

export const usePostStore = defineStore('post', {
  state: () => {
    return {
      posts: [] as Array<Post>,
      myPosts: [] as Array<Post>,
    }
  },
  actions: {
    async fetchPostById(postId: string) {
      return await request(`post/${postId}`, 'GET')
    },
    async createPost() {
      return await request(`post`, 'POST')
    },
    async fetchPosts() {
      this.posts = await request('post')
    },
    async fetchMyPosts() {
      this.myPosts = await request('post/user', 'POST')
    },
    async updatePost(postId: string, payload: Post) {
      let res = await request(`post/${postId}`, 'PUT', JSON.stringify(payload))
      return res
    },
    async importFromYuque(postId: string, text: string) {
      return await request(`post/${postId}/import-yuque`, 'POST', JSON.stringify({ text }))
    },
    async uploadSingleImage(postId: string, file: File, keepOriginalRatio = false) {
      const fd = await request(
        `file/uploadSingle/${postId}`,
        'POST',
        { file, keepOriginalRatio },
        { contentType: 'formData' }
      )
      return fd
    },
    async fetchImagesOfPost(postId: string) {
      return await request(`file/post/${postId}`, 'POST')
    },
    async deleteImage(fileId: string) {
      return await request(`file/${fileId}`, 'DELETE')
    },
    async deletePost(postId: string) {
      let res = await request(`post/${postId}`, 'DELETE')
      return res
    },
  },
})
