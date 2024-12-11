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
    async uploadSingleImage(postId: string, file: File) {
      const fd = await request(
        `file/uploadSingle/${postId}`,
        'POST',
        { file },
        { contentType: 'formData' }
      )
      return fd
    },
    async fetchImagesOfPost(postId: string) {
      return await request(`file/post/${postId}`, 'POST')
    },
    async deletePost(postId: string) {
      let res = await request(`post/${postId}`, 'DELETE')
      return res
    },
  },
})
