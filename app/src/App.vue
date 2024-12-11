<script setup lang="ts">
import Toast from './components/Toast.vue'
import { useUserStore } from './store/user'
import ImagePreview from './components/ImagePreview.vue'

const userStore = useUserStore()
userStore.getUserInfo()
</script>

<template>
  <!-- router-view cannot be inside KeepAlive or Transition -->
  <router-view v-slot="{ Component }">
    <keep-alive include="Home">
      <component :is="Component" />
    </keep-alive>
  </router-view>
  <transition name="toast-slide">
    <Toast class="toast" />
  </transition>
  <ImagePreview></ImagePreview>
</template>

<style lang="less">
body {
  margin: 0;
  background-color: #f6f6f6;
}

#app {
  margin: 0 auto;
  max-width: 750px;
  height: 100vh;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}

::-webkit-scrollbar {
  width: 6px;
  height: 16px;
}

::-webkit-scrollbar-track {
  background-color: #f6f6f6;
}

::-webkit-scrollbar-thumb {
  border-radius: 16px;
  background-color: #ddd;
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
  border: 1px solid #ccc;
  outline: none;
  font-size: 15px;
  transition: 0.125s ease;

  &:focus {
    border: 1px solid #2285d0;
  }
}

.card-group {
  margin-top: 1rem;
}
.card-group-name {
  margin: 0 0 0.5rem 3px;
  text-align: left;
  font-size: 14px;
  color: #aaa;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  &:not(:first-child) {
    margin-top: 0.75rem;
  }
}

textarea {
  display: block;
  resize: vertical;
  font-family: Avenir, Helvetica, Arial, sans-serif;
}

.toast-wrapper {
  .toast {
    margin-top: 24px;
  }
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
