import { defineStore } from 'pinia'
import { request } from '../utils/request'

export const useCategories = defineStore('category', {
  state: () => {
    return {
      categories: [] as Array<Category>,
      editing: {} as Category,
      categoryMap: {} as { [id: string]: Category }
    }
  },
  actions: {
    init() {
      if (!this.categories.length) this.fetchCategories()
    },
    async fetchCategories() {
      this.categories = await request('cat')
      this.categories.forEach(cat => this.categoryMap[cat._id] = cat)
    },
    checkParam() {
      return this.editing.title && this.editing.description
    },
    clear() {
      this.editing = {} as Category
    },
    async add() {
      if (!this.checkParam()) {
        return
      }
      let res = await request('cat', 'POST', JSON.stringify(this.editing))
    },
    async update() {
      if (!this.checkParam() || !this.editing._id) {
        return
      }
      let res = await request(`cat/${this.editing._id}`, 'PUT', JSON.stringify(this.editing))
    },
    async delete() {
      if (!this.editing._id) {
        return
      }
      let res = await request(`cat/${this.editing._id}`, 'DELETE')
      this.clear()
    },
    mapCategoryName (catIds: string[]): string[] {
      return catIds.map(id => this.categoryMap[id].title)
    }
  }
})