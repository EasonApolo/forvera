<template>
  <span class="dots">{{ dots }}</span>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  speed: {
    type: String,
    default: 'medium',
    validator: (val) => ['slow', 'medium', 'fast'].includes(val)
  }
})

// 映射速度配置（毫秒）
const speedMap = {
  fast: 200,
  medium: 400,
  slow: 700
}

const dots = ref('')
let timer = null

onMounted(() => {
  const interval = speedMap[props.speed] || 600
  timer = setInterval(() => {
    // 点的数量在 0~3 之间循环
    dots.value = dots.value.length < 3 ? dots.value + '.' : ''
  }, interval)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.dots {
  display: inline-block;
  /* 仅保留左对齐展示，不限制元素宽度 */
  text-align: left;
}
</style>