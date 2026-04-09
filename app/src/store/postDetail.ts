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
      this.post.content = this.replaceUrl(this.post.content)
      this.post.content = parse(this.post.content)
    },
    replaceUrl(html: string) {
      const regex = /<img src="(https?:\/\/[^\/]+)?(\/[^"]+)"/g
      return html.replace(regex, (_, _origin, path) => {
        const normalizedPath = (path || '').replace(/\/+/g, '/')
        const resourceBase = `${ip.replace(/\/+$/, '')}/resource${normalizedPath}`
        const thumb = normalizedPath.includes('_thumb')
          ? resourceBase
          : (() => {
              const dotIndex = resourceBase.lastIndexOf('.')
              return dotIndex === -1
                ? `${resourceBase}_thumb`
                : `${resourceBase.slice(0, dotIndex)}_thumb${resourceBase.slice(dotIndex)}`
            })()
        const original = resourceBase
        return `<img src="${thumb}" data-original="${original}"`
      })
    },
    clear() {
      this.post = {} as Post
    },
  },
})
