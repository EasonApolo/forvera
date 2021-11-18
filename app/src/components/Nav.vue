<script setup lang="ts">
import { ref } from 'vue'
</script>

<template>
  <div class="nav">
    <div class="nav-item"><router-link to="/">文字</router-link></div>
    <div class="nav-item"><router-link to="/message">发言</router-link></div>
    <div class="nav-item"><router-link to="/playground">果园</router-link></div>
    <div class="nav-item"><router-link to="/profile">个人</router-link></div>
  </div>
</template>

<style scoped>
a {
  color: #42b983;
}

label {
  margin: 0 0.5em;
  font-weight: bold;
}

code {
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 4px;
  color: #304455;
}
.nav {
  position: fixed;
  left: calc(50% - 8rem);
  width: 16rem;
  bottom: 1rem;
  display: flex;
  justify-content: space-between;
  border-radius: .5rem;
  background-color: white;
  box-shadow: 1px 1px 10px 1px #eee;
}
.nav-item {
  padding: .5rem 1rem;
}
</style>
