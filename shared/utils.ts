import { Coord } from './types/game'

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function getL2Distance(c1: Coord, c2: Coord): number {
  return Math.hypot(c1.x - c2.x, c1.y - c2.y)
}

export function limit({
  value,
  min = -Infinity,
  max = Infinity,
}: {
  value: number
  min?: number
  max?: number
}): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * 用于显示倒计时，将ms时间转为秒
 */
export function displayTime(time: number): number {
  return Math.max(Math.round(time / 1000), 0)
}

export function create2DArray<T>(rows: number, cols: number, defaultValue: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => defaultValue))
}

export class TaskQueue<T> {
  private queue: T[] = []
  private isProcessing: boolean = false
  private resolveTask: (task: T) => Promise<void>

  constructor(resolveTask: (task: T) => Promise<void>) {
    this.resolveTask = resolveTask
  }

  addTask(task: T | T[]) {
    if (Array.isArray(task)) {
      this.queue.push(...task)
    } else {
      this.queue.push(task)
    }
    this.processQueue()
  }

  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      await this.resolveTask(task)
    }
    this.isProcessing = false
  }
}

/**
 * 转换坐标格式[number, number] <-> { x: number, y: number }
 */
export function coordTransform(coord: [number, number]): Coord
export function coordTransform(coord: Coord): [number, number]
export function coordTransform(coord: [number, number] | Coord): Coord | [number, number] {
  if (Array.isArray(coord)) {
    return { x: coord[0], y: coord[1] }
  } else {
    return [coord.x, coord.y]
  }
}

export class ThrottledDataResolver<T> {
  private t: number = 0
  private interval: number
  private queue: T[] = []
  private resolver: (data: T[]) => Promise<void>
  private timer: any | null = null
  private isRunning = false

  constructor(interval: number, resolver: (data: T[]) => Promise<void>) {
    this.interval = interval
    this.resolver = resolver
  }

  addData(data: T[] | T) {
    if (Array.isArray(data)) {
      this.queue.push(...data)
    } else {
      this.queue.push(data)
    }
    this.tryResolver()
  }

  async tryResolver() {
    if (this.queue.length === 0) return
    const t = Date.now()
    if (t - this.t < this.interval) {
      // 没到时间，已经在运行则不管，等运行完毕后自动调用
      if (this.isRunning) return
      // 没在运行，没设置到时执行，则设置一个
      if (this.timer === null) {
        this.timer = setTimeout(() => {
          this.tryResolver()
          this.timer = null
        }, this.interval - (t - this.t))
      }
      // 已经设置了到时执行，则不管，等到时执行自动调用
    } else {
      // 到时间，但已经在运行，则不管，等运行完毕后自动调用
      if (this.isRunning) return
      // 到时间，没在运行，则运行
      this.t = t
      this.isRunning = true
      await this.resolver(this.queue)
      this.isRunning = false
      // 运行结束后，自动继续
      this.tryResolver()
    }
  }
}