export const formatDate = (ISODateStr: string): string => {
  const date = new Date(ISODateStr)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const pad = (val: string | number): string => {
  return val < 10 ? `0${val}` : `${val}`
}

export const readFile = (file: File): Promise<SelectedImage> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = e => resolve({ blob: e.target!.result as string, file })
    reader.readAsDataURL(file)
  })
}

export const throttle = (func: Function) => {
  let timeout: any = null
  return (...args: any) => {
    if (!timeout) {
      func(...args)
      timeout = setTimeout(() => {
        timeout = null
      }, 1000)
    }
  }
}