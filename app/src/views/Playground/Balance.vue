<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '@/components/Card.vue'
import List from 'components/layout/List.vue'

interface Balance {
  user: string
  value: Number,
  category: Number,
  type: Number, // 0 - income, 1 - expense
  created_time: Date,
  description: String,
}

</script>

<template>
  <List>
    <template v-slot:content>
      <Card>
        <div>金额</div>
        <div>类型</div>
        <div>日期</div>
        <div>备注</div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
</style>