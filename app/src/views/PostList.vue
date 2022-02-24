<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useMainStore } from '../store/main'
import { usePostStore } from '../store/post'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import { usePostDetail } from '../store/postDetail'
import { formatDate } from '../utils/common';

const [mainStore, postStore] = [useMainStore(), usePostStore()]
const { posts } = storeToRefs(postStore)
postStore.fetchPosts()

const read = (postId: string) => {
  const postDetailStore = usePostDetail()
  postDetailStore.init(postId)
  mainStore.go('post')
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card
        class="post"
        v-for="post in posts"
        @click="read(post._id)"
      >
        <div class="left">{{ post.title || '无标题' }}</div>
        <div class="right">
          <div
            class="date"
          >{{ formatDate(post.updated_time) }}</div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.post {
  display: flex;
  justify-content: space-between;
  align-items: center;
  .left {
    text-align: left;
  }
  .right {
    flex: 0 0 auto;
    .date {
      font-size: 12px;
      color: #888;
    }
  }
}
a {
  color: #42b983;
}

label {
  margin: 0 0.5em;
  font-weight: bold;
}

code {
  background-color: #eee;
  padding: 2px 4px;
  border-radius: 4px;
  color: #304455;
}
</style>
