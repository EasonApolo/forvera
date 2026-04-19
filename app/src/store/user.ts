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
      _id: undefined,
      username: undefined,
      token: undefined,
      role: 0,
      settings: {} as {
        playgroundSort?: string[]
      },
    },
  }),
  getters: {
    isLogin: state => !!state.userInfo.token,
    isAdmin: state => state.userInfo.role === 3,
  },
  actions: {
    // 如果有token则尝试获取userInfo，如果成功则可以免登
    async getUserInfo() {
      let token = localStorage.token
      if (token) {
        token = `Bearer ${token}`
        Object.assign(this.userInfo, { token })
        const res = await request('user/info', 'POST')
        const { _id, username, role, settings } = res
        if (username) {
          localStorage.username = username
          localStorage.role = role
          Object.assign(this.userInfo, {
            _id,
            username,
            role,
            settings: settings || {},
          })
        }
      }
    },
    async login() {
      let token
      const payload = this.loginData
      if (!(payload.username && payload.password)) return
      const res = await request('auth/login', 'POST', JSON.stringify(payload))
      token = res.token
      if (token) {
        localStorage.token = token
        token = `Bearer ${token}`
        Object.assign(this.userInfo, { token })
      }
      await this.getUserInfo()
    },
    async logout() {
      delete localStorage.token
      delete localStorage.username
      delete localStorage.role
      Object.assign(this.userInfo, {
        _id: undefined,
        token: undefined,
        username: undefined,
        role: undefined,
        settings: {},
      })
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
    async updateSettings(settings: { playgroundSort?: string[] }) {
      if (!this.isLogin) return
      const res = await request('user/settings', 'POST', JSON.stringify({ settings }))
      Object.assign(this.userInfo, {
        settings: res?.settings || this.userInfo.settings || {},
      })
    },
  },
})
