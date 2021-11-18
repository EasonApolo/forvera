import { defineStore } from 'pinia'
import { request } from '../utils/request'

export const useUser = defineStore('user', {
  state: () => ({
    userInfo: {}
  }),
  actions: {
  }
})