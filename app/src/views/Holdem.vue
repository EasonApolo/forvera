<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import io from 'socket.io-client'
import { ip } from '../config'
import { useUserStore } from '../store/user'
import { storeToRefs } from 'pinia'

const router = useRouter()
const userStore = useUserStore()
const { userInfo } = storeToRefs(userStore)
</script>

<template>
  <div class="holdem-container">
      <div class="info-text">
        <p>在链接后加上 <code>/roomId/userId</code> 进入房间</p>
      </div>
  </div>
</template>

<style lang="less" scoped>
.holdem-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 80vh;
  padding: 20px;
  text-align: center;
}

h2 {
  font-size: 24px;
  margin-bottom: 20px;
}

p {
  font-size: 16px;
  color: #666;
}


.info-text {
  margin-top: 20px;
  padding: 10px;
  background-color: #f5f5f5;
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
  color: #666;

  code {
    display: inline;
    background-color: #e8e8e8;
    padding: 2px 4px;
    border-radius: 2px;
    font-family: monospace;
  }
}
</style>
