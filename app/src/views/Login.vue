<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import Input from '../components/Input.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { useUserStore } from '../store/user'
import { useToastStore } from '../store/toast'

const userStore = useUserStore()
const toastStore = useToastStore()
const route = useRoute()
const router = useRouter()
const { loginData, isLogin } = storeToRefs(userStore)
const loading = ref({ login: false, register: false })
const navItems = [{ key: 'back', label: '‹ 返回' }]

const getRedirect = () => {
  return typeof route.query.redirect === 'string' && route.query.redirect
    ? route.query.redirect
    : '/profile'
}

const getSource = () => {
  if (typeof route.query.source !== 'string') return ''
  const source = route.query.source.trim()
  if (!source || source.startsWith('/login')) return ''
  return source
}

const login = async () => {
  loading.value.login = true
  await userStore.login()
  loading.value.login = false

  if (isLogin.value) {
    toastStore.showToast({ content: '登录成功～', type: 'OK' })
    router.replace(getRedirect())
  } else {
    toastStore.showToast({
      content: '登录失败，请检查用户名密码～',
      type: 'ERR',
    })
  }
}

const register = async () => {
  loading.value.register = true
  const res = await userStore.register()
  loading.value.register = false

  if (!res) {
    toastStore.showToast({ content: '注册失败，请检查输入～', type: 'ERR' })
    return
  }

  await userStore.getUserInfo()
  toastStore.showToast({ content: '注册成功～', type: 'OK' })
  router.replace(getRedirect())
}

const handleNavSelect = (key: string) => {
  if (key === 'back') {
    const source = getSource()
    if (source) {
      router.push(source)
      return
    }
    router.push({ name: 'postList' })
  }
}
</script>

<template>
  <List>
    <template #content>
      <Card class="login-wrapper" @keyup.enter="login">
        <template #title>登录</template>
        <Input class="login-input" v-model="loginData.username" placeholder="username" />
        <Input class="login-input" v-model="loginData.password" placeholder="password" password />
        <div class="flex-center actions">
          <Btn type="primary" @click="login" :loading="loading.login">登录</Btn>
          <Btn @click="register" :loading="loading.register">注册</Btn>
        </div>
      </Card>

      <BottomNavBar :items="navItems" @select="handleNavSelect" />
    </template>
  </List>
</template>

<style lang="less" scoped>
.login-wrapper {
  margin-bottom: 4.5rem;

  .login-input {
    margin-bottom: 0.5rem;
  }
}
</style>
