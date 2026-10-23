import { defineStore } from 'pinia'
import { request } from '../utils/request'
import type { AiSetting, SetAiSettingDto } from 'shared/types/user'

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
        diet?: {
          standardCalories?: number
          /** 每日代谢（kcal，默认 2000） */
          dailyMetabolism?: number
          dietStartDate?: string | null
          targetWeight?: number | null
          /** 体重图纵轴上下限（默认 100/75） */
          weightMin?: number
          weightMax?: number
        }
        stock?: {
          chartWidth?: number
          chartHeight?: number
          progressMethod?: 'linear' | 'ln' | 'sigmoid'
          /** K 线纵轴最低点：low=最低价，zero=0 点（默认） */
          yMin?: 'low' | 'zero'
          /** 默认分组，空则为「无分组」 */
          defaultGroup?: string
          watchlist?: {
            symbol: string
            name: string
            type?: string
            exchange?: string
            currency?: string
            addedAt?: number
            group?: string
          }[]
          /** 分组列表 */
          groups?: string[]
          tags?: string[]
          tooltipOffset?: { x?: number; y?: number }
          dataRange?: { day?: number; week?: number; month?: number }
        }
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
      const payload = this.loginData
      const { token } = await request(
        'auth/register',
        'POST',
        JSON.stringify(payload)
      )
      if (token) {
        localStorage.token = token
        Object.assign(this.userInfo, { token: `Bearer ${token}` })
        await this.getUserInfo()
      }
      return token
    },
    async updateSettings(settings: Record<string, any>) {
      if (!this.isLogin) return
      const res = await request('user/settings', 'POST', JSON.stringify({ settings }))
      Object.assign(this.userInfo, {
        settings: res?.settings || this.userInfo.settings || {},
      })
    },
    async getAiSetting(): Promise<AiSetting> {
      if (!this.isLogin) return {}
      const res = await request('user/ai-setting', 'GET')
      return res?.aiSetting || {}
    },
    async setAiSetting(payload: SetAiSettingDto): Promise<AiSetting> {
      const res = await request('user/ai-setting', 'POST', JSON.stringify(payload))
      return res?.aiSetting || {}
    },
  },
})
