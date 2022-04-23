<script setup lang="ts">
import Card from '@/components/Card.vue'
import List from '@/components/layout/List.vue'
import { formatDate } from '@/utils/common';
import { request } from '@/utils/request'
import { reactive, ref } from 'vue'
import Loading from '@/components/Loading.vue';

type Commit = { date: string, title: string, content?: string[], version?: string }
const loading = ref(false)
const commits = reactive([] as Commit[])
const fetchCommits = async () => {
  loading.value = true
  const res = await request('https://api.github.com/repos/EasonApolo/forvera/commits?per_page=5', 'GET', null, { withCredentials: false })
  res.map((commit: any) => {
    let { committer: { date }, message } = commit.commit
    date = formatDate(date)
    let [title, content] = message.split('\n\n')
    let version
    title = title.replace(/(\d\.\d\.\d)\s*/, (match: string, p1: string) => {
      version = p1
      return ''
    })
    if (content) content = content.split('\n')
    commits.push({
      date,
      version,
      title,
      content
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
          <div class="version">{{ commit.version }}</div>
          <div class="title">{{ commit.title }}</div>
          <div class="message">
            <div>
              <div v-for="c in commit.content">{{ c }}</div>
            </div>
          </div>
          <div class="date">{{ commit.date }}</div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.loading-svg {
  display: block;
  margin: 0 auto;
  width: 25px;
  height: 25px;
}

.card {
  text-align: left;
}

.card>.title {
  margin-bottom: 4px;
  font-weight: bold;
}

.commits {
  .commit {
    display: flex;
    margin-top: .5rem;
    width: 100%;
    align-items: flex-start;
    line-height: 1rem;
    font-size: 14px;

    &>div {
      flex: 0 0 auto;
    }

    .version {
      width: 2.5rem;
      font-style: italic;
    }

    .title {
      width: 8rem;
    }

    .message {
      flex: 1 0 auto;
      width: calc(100% - 18rem);

      &>div {
        word-break: break-all;
        overflow: auto;
        div {
          white-space: nowrap;
        }
      }
    }

    .date {
      width: 6rem;
      font-size: 12px;
      color: #aaa;
    }
  }
}
</style>