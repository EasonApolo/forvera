<template>
  <div class="vote-board-container" ref="containerRef">
    <!-- 1. 点赞区域 (左) -->
    <div 
      class="vote-side left" 
      :style="{ flex: leftFlex }"
    >
      <TransitionGroup name="pop-emoji" tag="div" class="emoji-wrapper left">
        <div 
          v-for="item in leftVotes" 
          :key="item.id" 
          class="emoji-circle"
          :style="circleStyle"
        >
          👍
        </div>
      </TransitionGroup>
    </div>

    <!-- 2. 动态偏移的分隔线 -->
    <div class="divider"></div>

    <!-- 3. 点踩区域 (右) -->
    <div 
      class="vote-side right" 
      :style="{ flex: rightFlex }"
    >
      <TransitionGroup name="pop-emoji" tag="div" class="emoji-wrapper">
        <div 
          v-for="item in rightVotes" 
          :key="item.id" 
          class="emoji-circle"
          :style="circleStyle"
        >
          👎
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  delay: {
    type: Number,
    default: 100
  },
  // 默认正常大小 40px
  maxSize: {
    type: Number,
    default: 40
  },
  // 最小缩小尺寸 20px (达到后会自适应换行)
  minSize: {
    type: Number,
    default: 20
  }
})

const containerRef = ref(null)
const leftVotes = ref([])
const rightVotes = ref([])
const currentSize = ref(props.maxSize) // 动态算出的 Emoji 尺寸

const queue = []
let timer = null

// 1. 核心算法：计算左右侧 Flex 比例 (解决“数量少时不要直接推过去”的问题)
// 逻辑：计算当前一侧实际需要的宽度，如果未达到 halfWidth，则按实际需求分配，不强推分隔线
const leftFlex = computed(() => {
  const l = leftVotes.value.length
  const r = rightVotes.value.length
  if (l === 0 && r === 0) return 1
  if (l === 0) return 0.001 // 极小保底，贴边
  if (r === 0) return 1     // 只有左边时，左边占满

  // 双方都有数据时，按数量比例平滑迁移
  return l / (l + r)
})

const rightFlex = computed(() => {
  const l = leftVotes.value.length
  const r = rightVotes.value.length
  if (l === 0 && r === 0) return 1
  if (r === 0) return 0.001
  if (l === 0) return 1

  return r / (l + r)
})

// 2. 核心算法：自适应计算 Emoji 大小 (解决“超宽自动缩小，达到最小后换行”的问题)
const updateDynamicSize = () => {
  if (!containerRef.value) return

  // 容器可用净宽度（扣除 padding 和分割线宽度）
  const containerWidth = containerRef.value.clientWidth - 40 
  const totalCount = leftVotes.value.length + rightVotes.value.length

  if (totalCount === 0) {
    currentSize.value = props.maxSize
    return
  }

  // 假设单行平铺，计算每个 Emoji 理论上可分到的宽度 (带间距 6px)
  const availablePerItem = (containerWidth - (totalCount * 6)) / totalCount

  if (availablePerItem >= props.maxSize) {
    currentSize.value = props.maxSize
  } else if (availablePerItem >= props.minSize) {
    // 挤不下，在 [minSize, maxSize] 范围内自适应等比缩小
    currentSize.value = Math.floor(availablePerItem)
  } else {
    // 达到最小极限 size 时，保持最小尺寸，依靠 flex-wrap 自动换行
    currentSize.value = props.minSize
  }
}

// 动态样式注入
const circleStyle = computed(() => ({
  width: `${currentSize.value}px`,
  height: `${currentSize.value}px`,
  fontSize: `${Math.max(10, currentSize.value * 0.9)}px` // 字体大小按比例缩放
}))

// 队列逻辑
const processQueue = () => {
  if (queue.length === 0) {
    timer = null
    return
  }

  const type = queue.shift()
  const voteItem = { id: Date.now() + Math.random() }

  if (type === 1) leftVotes.value.push(voteItem)
  else if (type === 0) rightVotes.value.push(voteItem)

  // 新增节点后实时 recalculate 尺寸
  nextTick(updateDynamicSize)

  timer = setTimeout(processQueue, props.delay)
}

const addVote = (type) => {
  if (Array.isArray(type)) {
    type.forEach(t => queue.push(t))
  } else {
    queue.push(type)
  }
  if (!timer) processQueue()
}

// 监听容器大小变更（如外层响应式缩放）
let resizeObserver = null
onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateDynamicSize()
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  if (timer) clearTimeout(timer)
  if (resizeObserver) resizeObserver.disconnect()
})

defineExpose({ addVote })
</script>

<style scoped>
.vote-board-container {
  pointer-events: none; /* 遮罩穿透 */
  display: flex;
  align-items: flex-start;
  width: 100%;
  min-height: 60px;
  background-color: rgba(245, 245, 247, 0.85);
  backdrop-filter: blur(8px);
  box-sizing: border-box;
  overflow: hidden;
}

.vote-side {
  display: flex;
  align-items: center;
  transition: flex 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.left { 
  justify-content: flex-end; 
}
.right { 
  justify-content: flex-start; 
}

/* 允许换行 (flex-wrap: wrap)，当达到 minSize 仍挤不下时自动换行 */
.emoji-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  align-items: center;
  padding: 0 4px;
  .left {
    justify-content: flex-end;
  }
}

.emoji-circle {
  user-select: none;
  /* 尺寸及平移动画过渡 */
  transition: width 0.3s ease, height 0.3s ease, font-size 0.3s ease, transform 0.4s ease;
}

.divider {
  width: 1px;
  height: auto;
  align-self: stretch;
  background-color: #d1d1d6;
  opacity: .3;
  border-radius: 2px;
  flex-shrink: 0;
  margin: 0 0px;
  transition: transform 0.4s ease;
}

/* FLIP 挤压动画 */
.pop-emoji-move {
  transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
}

.pop-emoji-enter-active {
  transition: 
    transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
    opacity 0.25s ease;
}

.pop-emoji-enter-from {
  opacity: 0;
  transform: scale(0);
}

.pop-emoji-enter-to {
  opacity: 1;
  transform: scale(1);
}
</style>