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
        <span>🌳Taxonomy</span>
      </Card>
      <Card class="entry" @click="goto('expiry')">
        <span>🥛什么时候过期？</span>
      </Card>
      <Card class="entry" @click="goto('holdem')">
        <span>🃏德扑</span>
      </Card>
      <Card class="entry" @click="goto('rating')">
        <span>⭐Rating</span>
      </Card>
      <div class="card-row">
        <a href="https://ys.mihoyo.com/cloud/#/" target="_blank" class="card-link">
          <Card class="entry">原神启动</Card>
        </a>
        <a href="https://sr.mihoyo.com/cloud/#/" target="_blank" class="card-link">
          <Card class="entry">崩铁启动</Card>
        </a>
      </div>
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
.card-row {
  margin-top: 0.5rem;
  display: flex;
  gap: 0.5rem;
  .card-link {
    flex: 1;
    display: block;
  }
}

</style>
