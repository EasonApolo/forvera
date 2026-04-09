import { defineStore } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../utils/request'
import { useCategories } from './category'
import { ip } from '../config'

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
    toBackendResourceUrl(url: string) {
      let pathOnly = url
      if (url.includes('://')) {
        try {
          const urlObj = new URL(url)
          pathOnly = urlObj.pathname
        } catch (e) {
          pathOnly = url
        }
      }

      pathOnly = pathOnly.replace(/\/+/g, '/')
      const resourcePath = pathOnly.startsWith('/resource')
        ? pathOnly
        : `/resource${pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`}`
      return `${ip.replace(/\/+$/, '')}${resourcePath}`
    },

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
      const resourceUrl = this.toBackendResourceUrl(url)

      this.url = this.toOriginal(resourceUrl)
      this.thumbUrl = this.toThumb(resourceUrl)
    },
    stopPreview() {
      this.url = ''
      this.thumbUrl = ''
    }
  }
})