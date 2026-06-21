import { defineStore } from 'pinia'

const DEFAULT_TIMEOUT = 2000

type Type = '?' | '!' | 'OK' | 'ERR' | 'loading'

type ToastEntry = {
  id: number
  content: string
  type: Type
  timer?: ReturnType<typeof setTimeout>
}

let nextToastId = 0

export const useToastStore = defineStore('toast', {
  state: () => {
    return {
      toasts: [] as ToastEntry[],
    }
  },
  actions: {
    showToast({ content, type, timeout = DEFAULT_TIMEOUT }: { content: string, type: Type, timeout?: number }) {
      if (!content) return

      const toast: ToastEntry = {
        id: ++nextToastId,
        content,
        type,
      }
      toast.timer = setTimeout(() => {
        this.clearToast(toast.id)
      }, timeout)
      this.toasts.push(toast)
    },
    clearToast(id: number) {
      const index = this.toasts.findIndex(item => item.id === id)
      if (index < 0) return
      const [toast] = this.toasts.splice(index, 1)
      if (toast?.timer) {
        clearTimeout(toast.timer)
      }
    },
    clear() {
      this.toasts.forEach(item => {
        if (item.timer) {
          clearTimeout(item.timer)
        }
      })
      this.toasts = []
    }
  }
})