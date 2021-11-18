<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMainStore } from '../store/storeMain';
import Card from '../components/Card.vue';

const mainStore = useMainStore()
const { loginData, isLogin, userInfo } = storeToRefs(mainStore)
const submit = () => {
  mainStore.login()
}
</script>

<template>
  <Card v-if="!isLogin">
    <input v-model="loginData.username" />
    <input v-model="loginData.password" />
    <div @click="submit">登录</div>
    <div @click="submit">注册</div>
  </Card>
  <Card v-else>
    <div>{{userInfo.username}}</div>
  </Card>
</template>

<style scoped>
</style>
