<script setup lang="ts">
import { storeToRefs } from 'pinia'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import Input from '../components/Input.vue'
import StepperFilter from '../components/StepperFilter.vue'
import { debounce, formatDate } from '../utils/common'
import { useMessageStore } from '../store/message'
import { useUserStore } from '../store/user'
import Gallery from '../components/Gallery.vue'
import { useToastStore } from '../store/toast'
import { useImageStore } from '../store/image'
import AddMessage from './AddMessage.vue'
import { ref, watch } from 'vue'

const [messageStore, userStore, toastStore, imageStore] = [
  useMessageStore(),
  useUserStore(),
  useToastStore(),
  useImageStore(),
]
const { messages } = storeToRefs(messageStore)
const { isLogin, isAdmin } = storeToRefs(userStore)

// dataing
const currentYear = new Date().getFullYear()
const year = ref<number>(currentYear)
const keyword = ref('')
const showReplyPanel = ref(false)

const fetchMessages = async () => {
  const trimmedKeyword = keyword.value.trim()
  const keywordParam = isAdmin.value ? trimmedKeyword : undefined
  const yearParam = isAdmin.value && !trimmedKeyword ? year.value : undefined
  await messageStore.fetchMessages(
    isLogin.value,
    yearParam,
    keywordParam
  )
}

const fetchBySearch = debounce(fetchMessages, 300)

const clearSearch = () => {
  if (keyword.value) {
    keyword.value = ''
    fetchMessages()
  }
}

// computed
const getReplyToUsername = (message: Message, reply: Message) => {
  let replyToUsername
  if (reply.level === 1) {
    const replyTo = message.descendants.find(d => d._id === reply.parent)
    if (replyTo) {
      replyToUsername = replyTo.user.username
    }
  }
  return replyToUsername
}
const clickImage = (images: string[], index: number) => {
  imageStore.preview(images[index])
}

// reply
const replyTo = (message?: Message) => {
  messageStore.reply(message)
  showReplyPanel.value = true
}

const closeReplyPanel = () => {
  showReplyPanel.value = false
  messageStore.clearMessageInput()
}

const deleteMessage = async (message: Message) => {
  if (confirm('确定要删除吗？')) {
    const res = await messageStore.deleteMessage(message._id)
    if (res) {
      toastStore.showToast({ content: '删除成功', type: '!' })
      fetchMessages()
    } else {
      toastStore.showToast({ content: '删除失败', type: '!' })
    }
  }
}

const toggleMessageStatus = async (message: Message) => {
  const nextStatus = message.status === 1 ? 0 : 1
  const actionText = nextStatus === 1 ? '显示' : '隐藏'
  if (confirm(`确定要${actionText}这条 twit 吗？`)) {
    const res = await messageStore.updateMessageStatus(message._id, nextStatus)
    if (res) {
      toastStore.showToast({
        content: `${actionText}成功`,
        type: '!',
      })
    } else {
      toastStore.showToast({
        content: `${actionText}失败`,
        type: '!',
      })
    }
  }
}

watch(
  () => [isLogin.value, isAdmin.value],
  () => {
    fetchMessages()
  },
  { immediate: true }
)
</script>

<template>
  <List>
    <template v-slot:content>
      <div v-if="isAdmin" class="admin-controls">
        <Card class="admin-card filter-card">
          <template #title>筛选</template>
          <div class="filter-row">
            <div class="filter-label">年份</div>
            <StepperFilter
              :value="year"
              :min="2016"
              :max="currentYear"
              :nullable="false"
              @update:value="year = typeof $event === 'number' ? $event : currentYear; fetchMessages()"
            />
          </div>
          <div class="filter-row">
            <div class="filter-label">搜索</div>
            <div class="search-wrapper">
              <div class="search-row">
                  <Input
                  v-model="keyword"
                  class="search-input"
                  @input="fetchBySearch"
                  placeholder="输入关键词"
                />
                <button v-if="keyword" class="clear-btn" @click.stop="clearSearch">
                  取消
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
      <Card
        class="message"
        :class="{ hidden: isAdmin && message.status === 0 }"
        v-for="message in messages"
      >
        <div class="header">
          <div class="name">{{ message.user.username }}</div>
          <div class="date">
            <span @click.stop="replyTo(message)">回复</span>
            <span
              v-if="isAdmin && message.level === 0"
              @click.stop="toggleMessageStatus(message)"
            >{{ message.status === 1 ? '隐藏' : '显示' }}</span>
            <span v-if="isAdmin" @click.stop="deleteMessage(message)">删除</span>{{ formatDate(message.created_time) }}
          </div>
        </div>
        <div
          class="content selectable"
          @mousedown.stop
          @touchstart.stop
          @touchmove.stop
        >{{ message.content }}</div>
        <Gallery
          v-if="message.files.length"
          class="gallery"
          :images="message.files.map(f => f.thumb)"
          :onClick="clickImage"
        ></Gallery>
        <div class="reply-wrapper" v-if="message.descendants?.length > 0">
          <div
            class="reply"
            v-for="reply in message.descendants"
          >
            <div class="header">
              <div class="name">{{ reply.user.username }}</div>
              <div class="name" v-if="getReplyToUsername(message, reply)">
                : {{ getReplyToUsername(message, reply) }}
              </div>
            </div>
            <div class="date"><span @click.stop="replyTo(reply)">回复</span><span v-if="isAdmin" @click.stop="deleteMessage(reply)">删除</span>{{ formatDate(reply.created_time) }}</div>
            <div
              class="content selectable"
              @mousedown.stop
              @touchstart.stop
              @touchmove.stop
            >{{ reply.content }}</div>
          </div>
        </div>
      </Card>
      <div class="ending">—— 完 ——</div>
      <div
        v-if="showReplyPanel"
        class="reply-overlay"
        @click.self="closeReplyPanel"
      >
        <div class="reply-panel">
          <AddMessage :floating="true" @close="closeReplyPanel" />
        </div>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>

.admin-card {
  text-align: left;
  border: 1px solid var(--border-light);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
}

.filter-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-row {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.75rem;
}

.filter-label {
  width: 2rem;
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-size: 13px;
}

.nav-btn,
.clear-btn {
  border: none;
  outline: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  background: var(--btn-bg);
  color: var(--text-secondary);
  font-size: 18px;
}

.nav-btn:hover,
.clear-btn:hover {
  background: var(--btn-hover);
}

.search-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

.search-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);

  &:hover {
    border-color: var(--accent-color);
  }
}

.search-input:focus {
  outline: none;
  border-color: var(--accent-color);
  background: var(--card-bg);
}

.clear-btn {
  padding: 0.6rem 0.85rem;
  border-radius: 0.75rem;
  background: var(--btn-bg);
  color: var(--text-secondary);
  font-size: 13px;
}

.message {
  padding: 0.375rem .75rem;
  text-align: left;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &:not(:first-child) {
    margin-top: 0.5rem;
  }

  .name {
    font-size: 15px;
    font-weight: 700;
  }

  .date {
    font-size: 12px;
    color: #aaa;

    span {
      margin-right: 0.5rem;
      cursor: pointer;
    }
  }

  .content {
    font-size: 15px;
    white-space: break-spaces;
  }

  .selectable {
    user-select: text;
    -webkit-user-select: text;
  }

  .gallery {
    margin: 0.5rem 0 0.5rem;
  }

  .reply-wrapper {
    margin-top: 1rem;
    display: flex;
    flex-wrap: wrap;

    /* justify-content: space-between; */
    .reply {
      margin: 0 1rem 0.75rem 0;
      padding: 0.25rem 0.5rem;
      border-radius: 0.5rem;
      box-shadow: var(--reply-shadow);
      background: var(--card-bg);

      .name {
        font-size: 12px;
        font-weight: 200;
      }

      .content {
        font-size: 14px;
      }

      .header {
        display: flex;

        div:not(:last-child) {
          margin-right: 0.125rem;
        }
      }
    }
  }
}

.message.hidden {
  opacity: 0.45;
  background: var(--bg);
}

.ending {
  margin-top: 1rem;
  font-size: 12px;
  color: #aaa;
}

.reply-overlay {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.35);
}

.reply-panel {
  width: 100%;
  padding: 0.75rem;
}

// .send {
//   position: fixed;
//   right: 1.5rem;
//   bottom: 6rem;
//   width: 3rem;
//   height: 3rem;
//   background: url(../assets/send.png) center/1.5rem no-repeat;
//   background-color: white;
//   border-radius: 2rem;
//   box-shadow: 0px 0px 16px 0px #ccc;
//   transition: .2s ease;
//   cursor: pointer;
//   &:hover {
//     transform: scale(.9);
//   }
// }
</style>
