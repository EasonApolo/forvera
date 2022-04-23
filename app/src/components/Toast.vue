<script setup lang="ts">
import { useToastStore } from '../store/toast'

import { storeToRefs } from 'pinia';
import Loading from './Loading.vue';

const toastStore = useToastStore()
const { type, show, content, icon } = storeToRefs(toastStore)
</script>

<template>
  <div class="toast-wrapper" v-if="show">
    <div class="toast">
      <Loading v-if="type === 'loading'"></Loading>
      <div
        v-else
        class="icon"
        :style="{ 'background-image': `url(${icon})` }"
      ></div>
      <div class="content">{{ content }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.toast-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 5rem;
  display: flex;
  align-items: top;
  justify-content: center;
  z-index: 1000;
  .toast {
    box-sizing: border-box;
    padding: 13px 16px;
    height: 50px;
    box-shadow: 0 4px 6px 0 #ccc;
    background-color: rgba(64, 64, 64, 1);
    border-radius: 4px;
    display: flex;
    align-items: center;
    .icon {
      width: 25px;
      height: 25px;
      background-size: contain;
      background-position: center;
      background-repeat: no-repeat;
    }
    .content {
      margin-left: 9px;
      font-size: 14px;
      color: #ccc;
    }
  }
}
</style>
