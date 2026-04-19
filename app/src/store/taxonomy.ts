import { defineStore } from 'pinia'
import { request } from '@/utils/request'

export interface TaxonomyNode {
  _id: string
  title: string
  description: string
  images: string[]
  defaultOpen?: boolean
  parent: string | null
  order: number
  created_time: string
  updated_time: string
}

export const useTaxonomyStore = defineStore('taxonomy', {
  state: () => ({
    nodes: [] as TaxonomyNode[],
  }),
  actions: {
    async fetchAll() {
      this.nodes = await request('taxonomy')
      return this.nodes
    },
    async create(payload: {
      title: string
      description: string
      parent: string | null
      images?: string[]
      defaultOpen?: boolean
    }) {
      return await request('taxonomy', 'POST', payload)
    },
    async update(
      nodeId: string,
      payload: {
        title?: string
        description?: string
        images?: string[]
        defaultOpen?: boolean
      }
    ) {
      return await request(`taxonomy/${nodeId}`, 'PUT', payload)
    },
    async remove(nodeId: string) {
      return await request(`taxonomy/${nodeId}`, 'DELETE')
    },
    async move(nodeId: string, payload: { parent: string | null; order: number }) {
      return await request(`taxonomy/${nodeId}/move`, 'PUT', payload)
    },
    async uploadImages(nodeId: string, files: File[]) {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      const uploaded = await request(`file/upload/taxonomy-${nodeId}`, 'POST', formData)
      return uploaded as Array<{ _id: string; url: string; thumb: string }>
    },
  },
})
