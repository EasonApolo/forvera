<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
</script>

<template>
  <List>
    <template v-slot:content>
      <Card><router-link to="/balance">记账本</router-link></Card>
      <Card>豆瓣酱</Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
</style>