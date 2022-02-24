import { defineStore } from 'pinia'
import { ip } from '../config'
import { useCategories } from './category'
import { usePostStore } from './post'

export function getUrlFromFD(fd: FileDescriptor, thumb?: boolean): string
export function getUrlFromFD(fd: Array<FileDescriptor>, thumb?: boolean): string[]
export function getUrlFromFD(fd: FileDescriptor | Array<FileDescriptor>, thumb = false): string | string[] {
  const getProp = (fd: FileDescriptor) => `${ip}${thumb ? fd.thumb : fd.url}`
  return Array.isArray(fd) ? fd.map(getProp) : getProp(fd)
}

export const useWriteStore = defineStore('write', {
  state: () => {
    return {
      postId: '' as string,
      post: {} as Post,
      files: [] as FileDescriptor[]
    }
  },
  getters: {
    images: (state) => {
      return getUrlFromFD(state.files)
    }
  },
  actions: {
    async init(postId?: string) {
      const postStore = usePostStore()
      if (postId) {
        this.post = await postStore.fetchPostById(postId)
      } else {
        this.post = await postStore.createPost()
      }
      this.postId = postId || this.post._id
    },
    changeStatus() {
      if (this.post.status === 1) this.post.status = 0
      else if (this.post.status === 0) this.post.status = 1
    },
    async publish() {
      if (this.post.title.length < 1 && this.post.content.length < 1) return
      let payload = { ...this.post, time: Date.now() }
      const postStore = usePostStore()
      const res = await postStore.updatePost(this.postId, payload)
      return res
    },
    async deletePost() {
      const postStore = usePostStore()
      return await postStore.deletePost(this.postId)
    },
    toggleCategory(catId: string) {
      if (!Array.isArray(this.post.category)) {
        this.post.category = [catId]
      } else if (this.post.category.includes(catId)) {
        this.post.category.splice(this.post.category.indexOf(catId), 1)
      } else {
        this.post.category.push(catId)
      }
    },
    async uploadImage(image: File) {
      await usePostStore().uploadSingleImage(this.postId, image)
      this.initUploadedImages()
    },
    async initUploadedImages() {
      const postStore = usePostStore()
      this.files = await postStore.fetchImagesOfPost(this.postId) as FileDescriptor[]
    }
  }
})