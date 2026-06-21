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
/* ── Light mode variables (default) ── */
:root {
  --bg: #f6f6f6;
  --card-bg: #ffffff;
  --card-bg-rgb: 255, 255, 255;
  --text: #2c3e50;
  --text-secondary: #888888;
  --text-muted: #aaaaaa;
  --border: #cccccc;
  --border-light: #eeeeee;
  --btn-bg: #ebebec;
  --btn-hover: #dddde0;
  --btn-text: rgba(0, 0, 0, 0.6);
  --scrollbar-track: #f6f6f6;
  --scrollbar-thumb: #dddddd;
  --nav-shadow: #cccccc;
  --code-bg: #f3f3f3;
  --quote-bg: #f8f8f8;
  --quote-border: #dddddd;
  --quote-text: #666666;
  --toc-item-color: #666666;
  --toc-toggle-bg: #f3f3f3;
  --toc-toggle-color: #555555;
  --hidden-post-bg: #eeeeee;
  --accent-color: #42b983;
  --skeleton-base: #ececec;
  --skeleton-highlight: #f7f7f7;
  --toast-bg: #ffffff;
  --toast-border: transparent;
  --toast-text: var(--text);
  --toast-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
  --toast-accent: rgba(66, 185, 131, 0.9);
  --reply-shadow: 1px 2px 6px 1px rgba(0, 0, 0, 0.08);
  --toc-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  --card-font: var(--text);
}

/* ── Dark mode variables ── */
:root.dark {
  --bg: #181818;
  --card-bg: #252525;
  --card-bg-rgb: 37, 37, 37;
  --text: #e4e4e4;
  --text-secondary: #999999;
  --text-muted: #777777;
  --border: #444444;
  --border-light: #333333;
  --btn-bg: #3a3a3a;
  --btn-hover: #4a4a4a;
  --btn-text: rgba(255, 255, 255, 0.75);
  --scrollbar-track: #181818;
  --scrollbar-thumb: #444444;
  --nav-shadow: rgba(0, 0, 0, 0.5);
  --code-bg: #2d2d2d;
  --quote-bg: #2a2a2a;
  --quote-border: #555555;
  --quote-text: #aaaaaa;
  --toc-item-color: #aaaaaa;
  --toc-toggle-bg: #333333;
  --toc-toggle-color: #aaaaaa;
  --hidden-post-bg: #333333;
  --accent-color: #42b983;
  --skeleton-base: #2f2f2f;
  --skeleton-highlight: #3a3a3a;
  --toast-bg: rgba(52, 52, 52, 1);
  --toast-border: transparent;
  --toast-text: #ccc;
  --toast-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  --toast-accent: rgba(66, 185, 131, 0.95);
  --reply-shadow: 0 8px 18px rgba(0, 0, 0, 0.45);
  --toc-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
  /* Card text should remain dark even in dark mode since cards are white */
  --card-font: #111111;
}

body {
  margin: 0;
  background-color: var(--bg);
  transition: background-color 0.25s ease, color 0.25s ease;
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
    border: 1px solid var(--accent-color);
  }

  &:focus {
    border: 1px solid var(--accent-color);
  }
}

.link {
  color: var(--accent-color);
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
