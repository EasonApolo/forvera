import { defineStore } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../utils/request'
import { useCategories } from './category'

export const useImageStore = defineStore('image', {
  state: () => {
    return {
      url: ''
    }
  },
  getters: {
    show: state => !!state.url
  },
  actions: {
    preview(url: string) {
      url = url.replace('_thumb', '')
      this.url = url
    },
    stopPreview() {
      this.url = ''
    }
  }
})