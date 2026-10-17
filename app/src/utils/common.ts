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

export const debounce = (func: Function, delay = 300) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return (...args: any) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func(...args)
    }, delay)
  }
}

// Windows-1252 高位区（0x80-0x9F）字符 → 原始字节
const CP1252_HIGH_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

/**
 * 修复 UTF-8 被误按 Windows-1252 解码产生的乱码（模型输出 IPA 音标时偶发）：
 * 如 "ËˆÉªÅ‹" → "ˈɪŋ"。仅当整串字符都能对应 CP1252 字节且能按 UTF-8 严格解码时才转换，
 * 正常文本（含 CJK、正确 IPA 扩展区字符）不受影响。
 */
export const fixMojibake = (s: string): string => {
  if (!s) return s
  const bytes: number[] = []
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code < 0x100) {
      bytes.push(code)
    } else if (CP1252_HIGH_BYTES[code] !== undefined) {
      bytes.push(CP1252_HIGH_BYTES[code])
    } else {
      return s
    }
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
    return /[^\u0000-\u007f]/.test(decoded) ? decoded : s
  } catch {
    return s
  }
}
/** 进度计算方式：跌幅=线性跌幅占比，ln=对数模型，sigmoid=S 型曲线（两头慢中间快） */
export type ProgressMethod = 'linear' | 'ln' | 'sigmoid'

/**
 * 目标进度百分比（0=起点价，100=到达目标价，反向可为负，可超 100）：
 * - linear 跌幅：(then-current)/(then-target)
 * - ln 对数：(ln then - ln current)/(ln then - ln target)，贴合几何布朗运动/复利心理
 * - sigmoid S 型：价格空间 logistic，s(p)=1/(1+e^(-k(p-m)))，m=中点、k=5/|跨度|，
 *   端点归一到 0/100，呈现“慢→快→慢”
 * 价格为非正数（ln 要求）、当时价=目标价或无意义时分母为 0，返回 null。
 */
export const progressPercent = (
  current: number,
  thenPrice: number,
  target: number,
  method: ProgressMethod = 'ln'
): number | null => {
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(thenPrice) ||
    !Number.isFinite(target) ||
    thenPrice === target
  ) {
    return null
  }
  if (method === 'linear') {
    return ((thenPrice - current) / (thenPrice - target)) * 100
  }
  if (method === 'ln') {
    if (current <= 0 || thenPrice <= 0 || target <= 0) return null
    return ((Math.log(thenPrice) - Math.log(current)) / (Math.log(thenPrice) - Math.log(target))) * 100
  }
  // sigmoid
  const k = 5 / Math.abs(thenPrice - target)
  const mid = (thenPrice + target) / 2
  const s = (p: number) => 1 / (1 + Math.exp(-k * (p - mid)))
  const denom = s(thenPrice) - s(target)
  if (denom === 0) return null
  return ((s(thenPrice) - s(current)) / denom) * 100
}
