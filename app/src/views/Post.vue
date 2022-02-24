<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import { usePostDetail } from '../store/postDetail'

const [postDetailStore] = [usePostDetail()]
const { post } = storeToRefs(postDetailStore)
</script>

<template>
  <List>
    <template v-slot:content>
      <Card>{{ post.title }}</Card>
      <Card class="description" v-if="post.description">{{ post.description }}</Card>
      <Card>
        <div class="content" v-html="post.content"></div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.content {
  text-align: left;
}
.description {
  font-size: 14px;
  color: #888;
}
</style>

<style lang="scss">
.h1 {
  line-height: 60px;
  font-weight: 700;
  font-size: 28px;
}
.h2 {
  line-height: 48px;
  font-weight: 600;
  font-size: 24px;
}
.h3 {
  line-height: 36px;
  font-weight: 500;
  font-size: 20px;
}
p, .ul1, .ul2, .ul3 {
  line-height: 28px;
}
.ul1, .ul2, .ul3 {
  position: relative;
  &::before {
    content: '•';
    position: absolute;
    top: 0;
    width: .5rem;
  }
}
.ul1 {
  padding-left: 1rem;
  &::before {
    left: .25rem;
  }
}
.ul2 {
  padding-left: 2rem;
  &::before {
    left: 1.25rem;
  }
}
.ul3 {
  padding-left: 3rem;
  &::before {
    left: 2.25rem;
  }
}
</style>