export const formatDate = (ISODateStr: string): string => {
  const date = new Date(ISODateStr)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const pad = (val: string | number): string => {
  return val < 10 ? `0${val}` : `${val}`
}

export const readFile = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target!.result as string)
    reader.readAsDataURL(file)
  })
}