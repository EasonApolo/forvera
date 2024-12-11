<script setup lang="ts">
import { useToastStore } from '@/store/toast'
import { useUserStore } from '@/store/user'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'

const userStore = useUserStore()
const router = useRouter()
const toastStore = useToastStore()
const { isLogin } = storeToRefs(userStore)

const goto = (routeName: string) => {
  if (isLogin.value) {
    router.push(routeName)
  } else {
    toastStore.showToast({ content: '需要登录~~', type: '!', timeout: 3000 })
  }
}
</script>

<template>
  <List>
    <template v-slot:content>
      <router-link to="/siteinfo">
        <Card>最近更新</Card>
      </router-link>
      <Card class="entry" @click="goto('balance')">
        <span :class="{ disabled: !isLogin }">记账本</span>
      </Card>
      <Card class="entry" @click="goto('rating')">
        <span :class="{ disabled: !isLogin }">Rating</span>
      </Card>
    </template>
  </List>
</template>

<style lang="less" scoped>
a {
  text-decoration: none;
  color: inherit;
}
.entry {
  cursor: pointer;
}

.disabled {
  opacity: 0.7;
}
</style>
