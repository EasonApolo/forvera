<script setup lang="ts">
import Nav from './components/Nav.vue'
</script>

<template>
  <router-view></router-view>
  <Nav />
</template>

<style>
html {
  height: 100vh;
}
body {
  margin: 0;
  height: 100%;
}
#app {
  height: calc(100% - 2rem);
  padding: 1rem .5rem;
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  background-color: #f6f6f6;
}
</style>
