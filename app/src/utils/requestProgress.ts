import { reactive } from 'vue'

/**
 * 全局请求进度条状态：
 * - 一轮（wave）从第一个请求发起开始：起点固定 20%
 * - 每完成一个请求，按完成比例推进剩余 80%（2 个：20% → 60% → ...），封顶 90%，
 *   冲满 100% 只留给整轮收尾
 * - 全部完成后有 150ms 宽限期：期间来了新请求则并入同一轮（串行 await 的接口链
 *   也算同一轮，前一个的完成进度不会被吞掉），宽限期内没有新请求才冲满 100% 再淡出
 * - 进度变化经步进队列应用，与上一次应用至少间隔 80ms，几乎同时完成的中间档位
 *   也能渲染出来
 * 独立 reactive 单例（不走 pinia），request.ts 在任何 store 之前就要用到。
 */
export const requestProgress = reactive({
  /** 进行中的请求数 */
  active: 0,
  /** 本轮发起过的请求总数（含已完成） */
  total: 0,
  visible: false,
  progress: 0,
})

/** 代际令牌：淡出/归零的延迟回调期间有新请求进来则作废 */
let token = 0

/** 相邻两步的最小间隔（ms）：保证每个中间档位至少停留一个绘制周期 */
const STEP_INTERVAL = 80
/** 全部完成后的宽限期（ms）：期间的新请求并入同一轮 */
const FINISH_GRACE = 150
/** 单次完成推进的封顶：100% 只在收尾时出现 */
const STEP_CAP = 90

let stepTimer: ReturnType<typeof setTimeout> | null = null
let stepQueue: number[] = []
let lastAppliedAt = 0
let finishTimer: ReturnType<typeof setTimeout> | null = null

const applyFinish = (current: number) => {
  requestProgress.progress = 100
  // 先冲满（宽度动画），再淡出，最后归零——归零发生在不可见之后，避免宽度回跳闪动
  setTimeout(() => {
    if (current !== token) return
    requestProgress.visible = false
    setTimeout(() => {
      if (current !== token) return
      requestProgress.progress = 0
    }, 350)
  }, 200)
}

const flushStep = () => {
  stepTimer = null
  if (stepQueue.length === 0) return
  stepQueue.shift()
  // 应用时按当前 total/active 重算（宽限期并入的新请求也计入分母），只进不退
  const completed = requestProgress.total - requestProgress.active
  const step = Math.min(STEP_CAP, 20 + 80 * (completed / requestProgress.total))
  requestProgress.progress = Math.max(requestProgress.progress, step)
  lastAppliedAt = Date.now()
  // 一次触发只应用一步，队列里还有就继续排（间隔 STEP_INTERVAL）
  if (stepQueue.length) {
    stepTimer = setTimeout(flushStep, STEP_INTERVAL)
  }
}

const queueStep = () => {
  stepQueue.push(Date.now())
  if (stepTimer) return
  // 距上次应用不足 80ms 的排队等待，保证中间档位能被绘制
  stepTimer = setTimeout(flushStep, Math.max(0, STEP_INTERVAL - (Date.now() - lastAppliedAt)))
}

const scheduleFinish = () => {
  const current = token
  finishTimer = setTimeout(() => {
    finishTimer = null
    if (current !== token) return
    applyFinish(current)
  }, FINISH_GRACE)
}

export const startRequestProgress = () => {
  token += 1
  if (finishTimer) {
    // 宽限期内来了新请求：取消收尾，并入同一轮（total 增加，进度不回退）
    clearTimeout(finishTimer)
    finishTimer = null
  } else if (requestProgress.active === 0) {
    // 全新一轮：重置计数，进度从 20% 起步
    stepQueue = []
    if (stepTimer) {
      clearTimeout(stepTimer)
      stepTimer = null
    }
    requestProgress.total = 0
    requestProgress.progress = 20
  }
  requestProgress.active += 1
  requestProgress.total += 1
  requestProgress.visible = true
}

export const endRequestProgress = () => {
  requestProgress.active = Math.max(0, requestProgress.active - 1)
  queueStep()
  if (requestProgress.active === 0) {
    scheduleFinish()
  }
}
