<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Card from '../components/Card.vue';
import { useUserStore } from '../store/user';
import Btn from '../components/Btn.vue';
import { useMainStore } from '../store/main';
import { usePostStore } from '../store/post';
import { formatDate } from '../utils/common';
import { useWriteStore } from '../store/write';
import Label from '../components/Label.vue'
import TextInput from '../components/TextInput.vue'
import { ref } from 'vue';
import { useToastStore } from '../store/toast';

const [userStore, mainStore, postStore, writeStore, toastStore] = [useUserStore(), useMainStore(), usePostStore(), useWriteStore(), useToastStore()]
const { loginData, isLogin, userInfo } = storeToRefs(userStore)
const { myPosts } = storeToRefs(postStore)

// 登录相关
userStore.login()
if (userStore.isLogin) {
  postStore.fetchMyPosts()
}
const login = async () => {
  await userStore.login()
  toastStore.showToast({ content: '登录成功～', type: 'OK' })
  postStore.fetchMyPosts()
}
const register = async () => {
  const res = await userStore.register()
  if (!res) {
    console.log('fail')
    return
  }
  postStore.fetchMyPosts()
}
const logout = async () => {
  userStore.logout()
  toastStore.showToast({ content: '已登出～', type: 'OK' })
}
const loading = ref({ write: false, login: false, register: false })

// 前往各个路由
const goWrite = () => {
  mainStore.router.push('write')
}
const create = async () => {
  loading.value.write = true
  await writeStore.init()
  loading.value.write = false
  goWrite()
}
const edit = async (postId: string) => {
  await writeStore.init(postId)
  goWrite()
}
const goCategory = () => {
  mainStore.router.push('category')
}
</script>

<template>
  <Card v-if="!isLogin" class="login-wrapper">
    <input class="text-input" v-model="loginData.username" />
    <input
      class="text-input"
      v-model="loginData.password"
      type="password"
    />
    <div class="flex-center">
      <Btn
        type="primary"
        @click="login"
        :loading="loading.login"
      >登录</Btn>
      <Btn @click="register" :loading="loading.register">注册</Btn>
    </div>
  </Card>
  <template v-else>
    <Card class="item user-info-bar">
      <div>{{ userInfo.username }}</div>
      <Btn @click="logout">登出</Btn>
    </Card>
    <Card class="item">
      <div class="actions">
        <Btn @click="create" :loading="loading.write">写文章</Btn>
        <Btn @click="goCategory">编辑分类</Btn>
      </div>
    </Card>
    <div class="my-posts">
      <Card class="item post" v-for="post in myPosts" :class="{ hidden: post.status !== 1 }">
        <div class="post-info">
          <span class="title">{{ post.title }}</span>
          <span class="desc">{{ formatDate(post.updated_time) }}</span>
          <div v-if="post.status !== 1" class="status">隐藏</div>
        </div>
        <div class="post-actions">
          <Btn @click="edit(post._id)">修改</Btn>
        </div>
      </Card>
    </div>
  </template>
</template>

<style lang="scss" scoped>
.login-wrapper {
  & > * {
    margin-bottom: 0.75rem;
  }
}
.item {
  &:not(:first-child) {
    margin-top: 0.5rem;
  }
}
.user-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.actions {
  display: flex;
  > div {
    margin-right: 1rem;
  }
}
.my-posts {
  margin-top: 0.5rem;
  .post {
    display: flex;
    align-items: center;
    justify-content: space-between;
    .post-info {
      display: flex;
      align-items: center;
      .title {
        max-width: 6rem;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .desc {
        margin-left: 0.5rem;
        font-size: 14px;
        color: #888;
      }
      .status {
        margin-left: .5rem;
        font-size: 13px;
        color: #666;
      }
    }
  }
  .hidden {
    background-color: #eee;
  }
}
</style>
