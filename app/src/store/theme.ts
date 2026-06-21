import { defineStore } from 'pinia'
import { ref } from 'vue'

type ThemeMode = 'light' | 'dark' | 'system'

const THEME_LIGHT_COLOR = '#f6f6f6'
const THEME_DARK_COLOR = '#181818'

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

  const syncThemeColor = (nextMode: ThemeMode) => {
    const desiredColor = resolveDarkByMode(nextMode) ? THEME_DARK_COLOR : THEME_LIGHT_COLOR
    let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = desiredColor
  }

  const applyTheme = (dark: boolean) => {
    document.documentElement.classList.toggle('dark', dark)
    isDark.value = dark
  }

  const applyMode = (nextMode: ThemeMode) => {
    mode.value = nextMode
    syncThemeColor(nextMode)
    applyTheme(resolveDarkByMode(nextMode))
  }

  const handleSystemChange = () => {
    if (mode.value === 'system') {
      applyMode('system')
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
