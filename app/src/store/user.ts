import { defineStore } from 'pinia'
import { request } from '../utils/request'
import { useToastStore } from './toast'

export const useUserStore = defineStore('user', {
  state: () => ({
    loginData: {
      username: '',
      password: '',
    },
    userInfo: {
      username: undefined,
      token: undefined,
    },
  }),
  getters: {
    isLogin: state => !!state.userInfo.token,
  },
  actions: {
    // 如果有token则尝试获取userInfo，如果成功则可以免登
    async getUserInfo() {
      let token = localStorage.token
      if (token) {
        token = `Bearer ${token}`
        Object.assign(this.userInfo, { token })
        const res = await request('user/info', 'POST')
        const { username } = res
        if (username) {
          localStorage.username = username
          Object.assign(this.userInfo, { username })
        }
      }
    },
    async login() {
      let token, username
      if (localStorage.token && localStorage.username) {
        token = localStorage.token
        username = localStorage.username
      }
      if (!(token && username)) {
        const payload = this.loginData
        if (!(payload.username && payload.password)) return
        const res = await request('auth/login', 'POST', JSON.stringify(payload))
        token = res.token
        username = this.loginData.username
      }
      if (token && username) {
        localStorage.token = token
        localStorage.username = username
        token = `Bearer ${token}`
        Object.assign(this.userInfo, { token, username })
      }
    },
    async logout() {
      delete localStorage.token
      delete localStorage.username
      Object.assign(this.userInfo, { token: undefined, username: undefined })
    },
    validateLoginForm() {
      if (
        this.loginData.username?.length < 3 ||
        this.loginData.password.length < 3
      )
        return false
      return true
    },
    async register() {
      if (!this.validateLoginForm()) return false
      let payload = this.loginData
      const { token } = await request(
        'auth/register',
        'POST',
        JSON.stringify(payload)
      )
      Object.assign(this.userInfo, { token, username: this.loginData.username })
    },
  },
})
