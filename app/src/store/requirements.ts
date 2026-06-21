import { defineStore } from 'pinia'
import { request } from '@/utils/request'

export type RequirementTask = {
  _id: string
  id: number
  title: string
  checked: boolean
  parent: string | null
  created_time: string
  updated_time: string
}

export const useRequirementsStore = defineStore('requirements', {
  state: () => ({
    tasks: [] as RequirementTask[],
  }),
  actions: {
    async fetchAll(showAll = false) {
      this.tasks = await request('requirements', 'GET', { showAll: showAll ? '1' : '0' })
      return this.tasks
    },
    async createTask(parent: string | null = null) {
      return await request('requirements', 'POST', { parent, title: '' })
    },
    async updateTask(taskId: string, payload: { title?: string; checked?: boolean }) {
      return await request(`requirements/${taskId}`, 'PUT', JSON.stringify(payload))
    },
    async moveTop(taskId: string) {
      return await request(`requirements/${taskId}/top`, 'PUT')
    },
    async moveTask(taskId: string, direction: 'up' | 'down') {
      return await request(`requirements/${taskId}/move`, 'PUT', JSON.stringify({ direction }))
    },
    async deleteTask(taskId: string) {
      return await request(`requirements/${taskId}`, 'DELETE')
    },
  },
})