<script setup lang="ts">
import Card from '@/components/Card.vue'
import List from '@/components/layout/List.vue'
import { formatDate } from '@/utils/common'
import { request } from '@/utils/request'
import { reactive, ref } from 'vue'
import Loading from '@/components/Loading.vue'

type Commit = {
  date: string
  title: string
}
const loading = ref(false)
const commits = reactive([] as Commit[])
const fetchCommits = async () => {
  loading.value = true
  const res = await request(
    'https://api.github.com/repos/EasonApolo/forvera/commits?per_page=5',
    'GET',
    null,
    { withCredentials: false }
  )
  res.map((commit: any) => {
    let {
      committer: { date },
      message,
    } = commit.commit
    date = formatDate(date)
    const [title] = message.split('\n\n')
    commits.push({
      date,
      title,
    })
  })
  loading.value = false
}
fetchCommits()
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="commits">
        <div class="title">Commits</div>
        <Loading v-if="loading" />
        <div v-for="commit in commits" class="commit">
          <div class="title">{{ commit.title }}</div>
          <div class="date">{{ commit.date }}</div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="less" scoped>
.loading-svg {
  display: block;
  margin: 0 auto;
  width: 25px;
  height: 25px;
}

.card {
  text-align: left;
}

.card > .title {
  margin-bottom: 4px;
  font-weight: bold;
}

.commits {
  .commit {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
    width: 100%;
    line-height: 1.25rem;
    font-size: 14px;

    .title {
      text-align: left;
      margin-right: 0.75rem;
      flex: 1 1 auto;
    }

    .date {
      flex: 0 0 auto;
      font-size: 12px;
      color: var(--text-muted);
    }
  }
}
</style>
