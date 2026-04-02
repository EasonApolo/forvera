<script setup lang="ts">
import { useRouter } from 'vue-router'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'

const router = useRouter()

const goto = (routeName: string) => {
  router.push({ name: routeName })
}
</script>

<template>
  <List>
    <template v-slot:content>
      <router-link to="/siteinfo">
        <Card>最近更新</Card>
      </router-link>
      <Card class="entry" @click="goto('taxonomy')">
        <span>Taxonomy</span>
      </Card>
      <Card class="entry" @click="goto('expiry')">
        <span>什么时候过期？</span>
      </Card>
      <Card class="entry" @click="goto('holdem')">
        <span>德扑</span>
      </Card>
      <Card class="entry" @click="goto('rating')">
        <span>Rating</span>
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

</style>
