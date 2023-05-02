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
      <div class="card-group-name">by {{ post.author?.username || '' }}</div>
      <Card>
        <Skeleton v-if="!post._id" />
        <div class="meta" v-else>
          <div class="left">
            <div class="title">{{ post.title }}</div>
            <div class="categories">{{ categoryStore.mapCategoryName(post.category || []).join(' / ') }}</div>
          </div>
          <div class="right">
            <div class="time" v-if="post.created_time !== post.updated_time">=> {{ formatDate(post.updated_time) }}</div>
            <div class="time">{{ formatDate(post.created_time) }}</div>
          </div>
        </div>
      </Card>
      <Card class="main">
        <Skeleton v-if="!post._id" />
        <div v-else>
          <div class="description" v-if="post.description">{{ post.description }}</div>
          <div class="content" v-html="post.content"></div>
        </div>
      </Card>
      <div class="ending" v-if="post">—— 完 ——</div>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.meta {
  display: flex;
  align-items: center;
  text-align: left;

  .left {
    flex: 1 1 auto;
    .title {
      font-size: 18px;
    }
    .categories {
      margin-top: 4px;
      font-size: 12px;
      color: #888;
    }
  }

  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex: 0 1 auto;
    .time {
      flex: 1 0 auto;
      font-size: 12px;
      color: #888;
    }
  }
}

.main {
  padding: 0 1rem;
  overflow: hidden;
  text-align: left;

  .content {
    font-size: 15px;
  }

  .description {
    padding: 1rem 0 .75rem;
    font-size: 14px;
    color: #888;
    border-bottom: 1px solid #eee;
  }
}
.ending {
  margin-top: 1rem;
  font-size: 12px;
  color: #aaa;
}
</style>

<style lang="scss">
code {
  display: block;
  margin: 1em 0;
  padding: .5rem 1rem;
  line-height: 18px;
  background-color: #f3f3f3;
  white-space: pre-wrap;
  font-family: Consolas, "Courier New", monospace;
  font-size: 13px;
}
.h1, .h2, .h3, .h4 {
  margin: 1em 0 0 0;
  font-weight: bold;
}
.h1 {
  line-height: 60px;
  font-size: 28px;
}
.h2 {
  line-height: 48px;
  font-size: 24px;
}
.h3 {
  line-height: 36px;
  font-size: 20px;
}
.h4 {
  line-height: 24px;
  font-size: 16px;
}

p,
.ul1,
.ul2,
.ul3 {
  line-height: 26px;
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
img {
  display: block;
  margin: 0 auto;
}
.image-description {
  display: block;
  font-style: italic;
  text-align: center;
  color: #aaa;
  font-size: 12px;
}
</style>