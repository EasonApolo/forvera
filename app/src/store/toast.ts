import { defineStore } from 'pinia'

const DEFAULT_TIMEOUT = 2000

const ICONS = {
  '?': 'https://pt-starimg.didistatic.com/static/starimg/img/KY7KIe3Q4q1639999226185.png',
  '!': 'https://pt-starimg.didistatic.com/static/starimg/img/jGg8Oue4V41639999416168.png',
  OK: 'https://pt-starimg.didistatic.com/static/starimg/img/iHBDA1efzF1637660245957.png',
  ERR: 'https://pt-starimg.didistatic.com/static/starimg/img/lbgKE9Icl91639038730163.png',
  LOADING: ''
}

type Type = keyof typeof ICONS

export const useToastStore = defineStore('toast', {
  state: () => {
    return {
      show: false,
      type: '',
      icon: '',
      content: '',
      timer: 0
    }
  },
  actions: {
    showToast({ content, type, timeout = DEFAULT_TIMEOUT }: { content: string, type: Type, timeout?: number }) {
      if (!content) return
      if (this.show) {
        clearTimeout(this.timer)
      }
      this.content = content
      this.type = type
      this.icon = ICONS[type]
      this.show = true
      this.timer = setTimeout(this.clear, timeout)
    },
    clear() {
      this.show = false
      this.content = ''
    }
  }
})