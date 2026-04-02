import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const getInitialTheme = (): boolean => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  const isDark = ref(false)

  const applyTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    isDark.value = dark
  }

  const init = () => {
    applyTheme(getInitialTheme())
  }

  const toggle = () => {
    const next = !isDark.value
    localStorage.setItem('theme', next ? 'dark' : 'light')
    applyTheme(next)
  }

  return { isDark, init, toggle }
})
