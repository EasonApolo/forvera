import { defineStore } from 'pinia'
import { ref } from 'vue'

type ThemeMode = 'light' | 'dark' | 'system'

export const useThemeStore = defineStore('theme', () => {
  const getInitialMode = (): ThemeMode => {
    const savedMode = localStorage.getItem('themeMode')
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
      return savedMode
    }

    const legacyTheme = localStorage.getItem('theme')
    if (legacyTheme === 'light' || legacyTheme === 'dark') {
      return legacyTheme
    }

    return 'system'
  }

  const resolveDarkByMode = (nextMode: ThemeMode): boolean => {
    if (nextMode === 'dark') return true
    if (nextMode === 'light') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  const mode = ref<ThemeMode>('system')
  const isDark = ref(false)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  let mediaBound = false

  const applyTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    isDark.value = dark
  }

  const applyMode = (nextMode: ThemeMode) => {
    mode.value = nextMode
    applyTheme(resolveDarkByMode(nextMode))
  }

  const handleSystemChange = () => {
    if (mode.value === 'system') {
      applyTheme(resolveDarkByMode('system'))
    }
  }

  const init = () => {
    applyMode(getInitialMode())
    if (!mediaBound) {
      media.addEventListener('change', handleSystemChange)
      mediaBound = true
    }
  }

  const setMode = (nextMode: ThemeMode) => {
    localStorage.setItem('themeMode', nextMode)
    applyMode(nextMode)
  }

  const cycleMode = () => {
    if (mode.value === 'light') {
      setMode('dark')
      return
    }
    if (mode.value === 'dark') {
      setMode('system')
      return
    }
    setMode('light')
  }

  const toggle = () => {
    cycleMode()
  }

  return { isDark, mode, init, toggle, setMode, cycleMode }
})
