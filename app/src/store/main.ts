import { defineStore } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { request } from '../utils/request'
import { useCategories } from './category'

export const useMainStore = defineStore('main', {
  state: () => {
    return {
      posts: [],
      route: useRoute(),
      router: useRouter()
    }
  },
  actions: {
    async init() {
      const categoryStore = useCategories()
      categoryStore.fetchCategories()
    },
    async go(link: string) {
      this.router.push(link)
    }
  }
})