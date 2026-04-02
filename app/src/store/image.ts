import { defineStore } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../utils/request'
import { useCategories } from './category'

export const useImageStore = defineStore('image', {
  state: () => {
    return {
      url: '',
      thumbUrl: ''
    }
  },
  getters: {
    show: state => !!state.url || !!state.thumbUrl
  },
  actions: {
    toOriginal(url: string) {
      return url.replace('_thumb', '')
    },
    toThumb(url: string) {
      if (url.includes('_thumb')) {
        return url
      }
      const dotIndex = url.lastIndexOf('.')
      if (dotIndex === -1) {
        return `${url}_thumb`
      }
      return `${url.slice(0, dotIndex)}_thumb${url.slice(dotIndex)}`
    },
    preview(url: string) {
      this.url = this.toOriginal(url)
      this.thumbUrl = this.toThumb(url)
    },
    stopPreview() {
      this.url = ''
      this.thumbUrl = ''
    }
  }
})