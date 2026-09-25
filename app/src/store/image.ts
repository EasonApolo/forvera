import { defineStore } from 'pinia'
import { parseImageSizeFromUrl, toViewerUrls } from '@/components/imageViewer'

export const useImageStore = defineStore('image', {
  state: () => {
    return {
      url: '',
      thumbUrl: '',
      width: 0,
      height: 0,
      loadedOriginals: {} as Record<string, boolean>,
    }
  },
  getters: {
    show: state => !!state.url || !!state.thumbUrl
  },
  actions: {
    markOriginalLoaded(url: string) {
      if (!url) return
      this.loadedOriginals[url] = true
    },
    preview(url: string) {
      const { original, thumb } = toViewerUrls(url)
      const size = parseImageSizeFromUrl(original)
      this.url = original
      this.thumbUrl = this.loadedOriginals[original] ? '' : thumb
      this.width = size?.width || 0
      this.height = size?.height || 0
    },
    stopPreview() {
      this.url = ''
      this.thumbUrl = ''
      this.width = 0
      this.height = 0
    }
  }
})