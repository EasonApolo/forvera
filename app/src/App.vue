<script setup lang="ts">
import Nav from './components/Nav.vue'
import Toast from './components/Toast.vue';
</script>

<template>
  <keep-alive exclude="profile">
    <router-view></router-view>
  </keep-alive>
  <transition name="toast-slide">
    <Toast class="toast" />
  </transition>
  <Nav />
</template>

<style lang="scss">
body {
  margin: 0;
  background-color: #f6f6f6;
}
#app {
  margin: 0 auto;
  max-width: 750px;
  min-height: calc(100vh - 9rem);
  padding: 1rem 0.5rem 8rem;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
}
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
  & > *:not(:last-child) {
    margin-right: 1rem;
  }
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
textarea {
  display: block;
  resize: vertical;
}
.toast-wrapper {
  .toast {
    margin-top: 24px;
  }
}
.toast-slide-enter-active, .toast-slide-leave-active {
  transition: .3s ease-out;
}
.toast-slide-enter-from, .toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
