<script setup lang="ts">
import { ref } from 'vue'
</script>

<template>
  <div class="nav">
    <div class="nav-item"><router-link to="/">文字</router-link></div>
    <div class="nav-item"><router-link to="/message">发言</router-link></div>
    <div class="nav-item pg"><router-link to="/playground"><div>play</div><div>ground</div></router-link></div>
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
  bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-around;
  border-radius: .5rem;
  background-color: white;
  box-shadow: 0px 0px 12px 0px #ccc;
}
.nav-item {
  padding: .5rem 0;
  line-height: 14px;
}
.pg {
  font-size: 12px;
}
</style>
