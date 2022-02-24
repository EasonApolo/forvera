<script setup lang="ts">
// withDefaults(defineProps<{ size?: number }>(), { size: 50 })
</script>

<template>
  <svg viewBox="0 0 50 50" class="loading-svg">
    <circle
      cx="25"
      cy="25"
      r="20"
      fill="none"
      class="path"
    />
  </svg>
</template>

<style lang="scss" scoped>
.loading-svg {
  width: 50px; /*设置svg显示区域大小*/
  height: 50px;
  animation: loading-rotate 2s infinite ease-in-out;
}
.path {
  stroke: white; /*给画笔设置一个颜色*/
  stroke-width: 4; /*设置线条的宽度*/
}
.path {
  animation: loading-dash 2s ease-in-out infinite;
}
@keyframes loading-dash {
  0% {
    stroke-dasharray: 1, 126; /*实线部分1，虚线部分126*/
    stroke-dashoffset: 0; /*前面1/126显示实线，后面125显示空白*/
  }

  50% {
    stroke-dasharray: 95, 126; /*实线部分95，虚线部分126*/
    stroke-dashoffset: -31px; /*顺时针偏移31/126，即前31/126显示空白，后面3/4显示线条*/
  }

  to {
    stroke-dasharray: 6, 120; /*实线部分6，虚线部分120*/
    stroke-dashoffset: -120px; /*最后顺时针偏移120/126，即前120/126显示空白，后面6点显示线条部分*/
  }
}
@keyframes loading-rotate {
  to {
    transform: rotate(1turn); // 旋转1圈
  }
}
</style>