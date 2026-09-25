<script setup lang="ts">
import Toast from './components/Toast.vue'
import { useUserStore } from './store/user'
import { useThemeStore } from './store/theme'
import ImageViewer from './components/ImageViewer.vue'

const userStore = useUserStore()
userStore.getUserInfo()

const themeStore = useThemeStore()
themeStore.init()
</script>

<template>
  <!-- router-view cannot be inside KeepAlive or Transition -->
  <router-view v-slot="{ Component }">
    <keep-alive include="Home">
      <component :is="Component" />
    </keep-alive>
  </router-view>
  <transition name="toast-slide">
    <Toast />
  </transition>
  <ImageViewer></ImageViewer>
</template>

<style lang="less">
:root {
  /* ── Base palette (light) · 唯一存放色值的地方 ── */
  --c-brand: #42b983;
  --c-surface: #ffffff; /* 卡片等前景面 */
  --c-bg: #f6f6f6; /* 页面底色 */
  --c-subtle: #f3f3f3; /* 下沉填充：代码块 / 引用 / toggle */
  --c-line-1: #eeeeee; /* 最浅分割线 */
  --c-line-2: #dddddd; /* 中等分割线 / 滚动条 */
  --c-line-3: #cccccc; /* 强边框 */
  --c-fg: #2c3e50; /* 主文字 */
  --c-fg-1: #666666; /* 次强文字 / 引用文字 */
  --c-fg-2: #888888; /* 次要文字 */
  --c-fg-3: #aaaaaa; /* 弱化文字 */

  /* ── 语义色（组件里优先用这些）── */
  --bg: var(--c-bg);
  --card-bg: var(--c-surface);
  --card-bg-rgb: 255, 255, 255;
  --text: var(--c-fg);
  --text-secondary: var(--c-fg-2);
  --text-muted: var(--c-fg-3);
  --border: var(--c-line-3);
  --border-light: var(--c-line-1);
  --primary-color: var(--c-brand);

  /* ── 派生别名（都指向基础色，仅按语义命名）── */
  --btn-bg: var(--c-line-1);
  --btn-hover: var(--c-line-2);
  --btn-text: rgba(0, 0, 0, 0.6);
  --scrollbar-track: var(--c-bg);
  --scrollbar-thumb: var(--c-line-2);
  --nav-shadow: var(--c-line-3);
  --code-bg: var(--c-subtle);
  --quote-bg: var(--c-subtle);
  --quote-border: var(--c-line-2);
  --quote-text: var(--c-fg-1);
  --toc-toggle-bg: var(--c-subtle);
  --reply-shadow: 1px 2px 6px 1px rgba(0, 0, 0, 0.08);
}

:root.dark {
  /* ── Base palette (dark) · 只覆盖基础层，语义/别名自动跟随 ── */
  --c-brand: #42b983;
  --c-surface: #252525;
  --c-bg: #181818;
  --c-subtle: #2d2d2d;
  --c-line-1: #333333;
  --c-line-2: #444444;
  --c-line-3: #444444;
  --c-fg: #e4e4e4;
  --c-fg-1: #aaaaaa;
  --c-fg-2: #999999;
  --c-fg-3: #777777;

  /* ── 无法从基础色派生、需按模式覆盖的少数项 ── */
  --card-bg-rgb: 37, 37, 37;
  --btn-text: rgba(255, 255, 255, 0.75);
  --nav-shadow: rgba(0, 0, 0, 0.5);
  --reply-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
}

body {
  margin: 0;
  background-color: var(--bg);
  transition: background-color 0.25s ease, color 0.25s ease;
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

#app {
  margin: 0 auto;
  max-width: 750px;
  height: 100vh;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: var(--text);
}

::-webkit-scrollbar {
  width: 4px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background-color: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  border-radius: 16px;
  background-color: var(--scrollbar-thumb);
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;

  & > *:not(:last-child) {
    margin-right: 1rem;
  }
}

a {
  text-decoration: none;
}

.flex {
  display: flex;
}

.text-input {
  width: calc(100% - 1.8rem);
  padding: 0.6rem 0.9rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  outline: none;
  font-size: 15px;
  transition: 0.125s ease;
  background-color: var(--card-bg);
  color: var(--text);

  &:hover {
    border: 1px solid var(--primary-color);
  }

  &:focus {
    border: 1px solid var(--primary-color);
  }
}

.flex-lr-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  .left {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .right {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
}

.link {
  color: var(--primary-color);
  cursor: pointer;
}

.card-group {
  margin-top: 1rem;
}

.ending {
  margin-top: 1rem;
  font-size: 12px;
  color: #aaa;
}

textarea {
  display: block;
  resize: vertical;
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: 0.3s ease-out;
}

.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
