<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import { usePostDetail } from '../store/postDetail'
import { useCategories } from '../store/category'
import { formatDate } from '../utils/common';
import Skeleton from '@/components/layout/Skeleton.vue'
import { onBeforeRouteLeave } from 'vue-router'

const [postDetailStore, categoryStore] = [usePostDetail(), useCategories()]
const { post } = storeToRefs(postDetailStore)
onBeforeRouteLeave(() => { postDetailStore.clear(); return true })
</script>

<template>
  <List>
    <template v-slot:content>
      <Card>
        <Skeleton v-if="!post" />
        <div class="meta" v-else>
          <div class="title">{{ post.title }}</div>
          <div class="author">by {{ post.author?.username || '' }}</div>
          <div class="time">{{ formatDate(post.updated_time) }}</div>
          <div class="categories">{{ categoryStore.mapCategoryName(post.category || []).join(' / ') }}</div>
        </div>
      </Card>
      <Card class="main">
        <Skeleton v-if="!post" />
        <div v-else>
          <div class="description" v-if="post.description">{{ post.description }}</div>
          <div class="content" v-html="post.content"></div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.meta {
  display: flex;
  align-items: flex-end;
  text-align: left;

  .title {
    font-size: 18px;
  }

  .time,
  .author,
  .categories {
    margin-left: .5rem;
    font-size: 12px;
    color: #888;
  }

  .time {
    flex: 1 0 auto;
  }
}

.main {
  text-align: left;
  text-indent: 2rem;

  .content {}

  .description {
    margin-top: .5rem;
    font-size: 14px;
    color: #888;
  }
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

p,
.ul1,
.ul2,
.ul3 {
  line-height: 28px;
}

.ul1,
.ul2,
.ul3 {
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