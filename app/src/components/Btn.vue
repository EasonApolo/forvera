<script setup lang="ts">
const props = defineProps<{
  type?: string
  loading?: boolean
  small?: boolean
  size?: 'small' | 'default'
  downloadProgress?: number // 0-100, when set, shows download mode
  downloadLoaded?: number // bytes loaded
  downloadTotal?: number // bytes total
  downloadSpeed?: number // bytes per second
}>()

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`
}
</script>

<template>
  <div
    class="button"
    :class="{
      primary: props.type == 'primary',
      danger: props.type == 'danger',
      small: props.small || props.size === 'small',
      downloading: props.downloadProgress !== undefined,
    }"
  >
    <div
      v-if="props.downloadProgress !== undefined"
      class="download-fill"
      :style="{ width: `${props.downloadProgress}%` }"
    ></div>
    <div v-if="props.loading" class="loading-content">
      <span class="loading-placeholder"><slot></slot></span>
      <span class="loading-overlay">
        <svg viewBox="0 0 50 50" class="loading-svg">
          <circle cx="25" cy="25" r="20" fill="none" class="path" />
        </svg>
      </span>
    </div>
    <div v-else-if="props.downloadProgress !== undefined" class="download-content">
      <svg viewBox="0 0 50 50" class="loading-svg download-spinner">
        <circle cx="25" cy="25" r="20" fill="none" class="path" />
      </svg>
      <span class="download-text">
        {{ formatBytes(props.downloadLoaded) }} / {{ formatBytes(props.downloadTotal) }}
        <template v-if="props.downloadSpeed"> · {{ formatBytes(props.downloadSpeed) }}/s</template>
      </span>
    </div>
    <div v-else>
      <slot></slot>
    </div>
  </div>
</template>

<style lang="less" scoped>
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  box-sizing: border-box;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0.25rem .5rem;
  color: var(--btn-text);
  border-radius: 6px;
  background-color: var(--btn-bg);
  transition: 0.2s ease;
  cursor: pointer;
  font-size: 14px;
  position: relative;
  overflow: hidden;
  
  &:hover {
    background-color: var(--btn-hover);
  }
  
  &.downloading {
    background-color: var(--btn-bg);

    &:hover {
      background-color: var(--btn-hover);
    }
  }

  .download-fill {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 0;
    background-color: var(--accent-color);
    transition: width 0.35s linear;
    z-index: 0;
  }

  .download-content {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: white;
    font-size: 0.75rem;
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);

    .download-spinner {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .download-text {
      white-space: nowrap;
    }
  }
  
  .loading-content {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loading-placeholder {
    visibility: hidden;
  }

  .loading-overlay {
    position: absolute;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .loading-svg {
    display: block;
    width: 16px; /*设置svg显示区域大小*/
    height: 16px;
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
  &.small {
    padding: .125rem .25rem;
    font-size: .75rem;
    width: auto;

    .loading-svg {
      width: 14px;
      height: 14px;
    }
  }
}
.primary {
  color: white;
  background-color: var(--accent-color);
  &:hover {
    background-color: var(--accent-color);
  }
}

.danger {
  color: white;
  background-color: #ff4d4f;
  &:hover {
    background-color: #ff7875;
  }
}
</style>
