<script setup lang="ts">
import Btn from './Btn.vue';
import { ref } from 'vue'

const { change, multiple=false } = defineProps<{ change: (target: HTMLInputElement) => void, multiple: boolean }>()

const fileInput = ref({} as HTMLInputElement)
const proxyClick = () => {
  fileInput.value.click()
}
const proxyHandler = (e: Event) => {
  change(e.target as HTMLInputElement)
}
</script>

<template>
  <Btn @click="proxyClick">选择</Btn>
  <input ref="fileInput" class="input" type="file" @change="proxyHandler" :multiple="multiple"/>
</template>

<style lang="scss" scoped>
.input {
  display: none;
  outline: none;
}
</style>