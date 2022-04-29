<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMainStore } from '../store/main';
import List from '../components/layout/List.vue';
import Card from '../components/Card.vue';
import { throttle, formatDate, readFile } from '../utils/common';
import { useMessageStore } from '../store/message';
import { useUserStore } from '../store/user';
import Gallery from '../components/Gallery.vue';
import { useToastStore } from '../store/toast';
import { onBeforeRouteLeave } from 'vue-router';
import { useImageStore } from '../store/image';

const [messageStore, userStore, mainStore, toastStore, imageStore] = [useMessageStore(), useUserStore(), useMainStore(), useToastStore(), useImageStore()]
const { messages, messageInput, messageWrapper } = storeToRefs(messageStore)
const { isLogin } = storeToRefs(userStore)

// dataing
messageStore.fetchMessages(true)
const doFetch = throttle(async () => {
  let res = await messageStore.fetchMessages()
  if (res && res.length <= 0) toastStore.showToast({ content: '没有更多啦', type: '!' })
})
const onScroll = (e: any) => {
  let parentHeight = e.target.clientHeight
  let scrollHeight = e.target.scrollTop
  let childHeight = e.target.getElementsByClassName('layout-list')[0].clientHeight
  let atBottom = scrollHeight + parentHeight >= childHeight - 10 * 16
  if (atBottom) {
    doFetch()
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
  mainStore.router.push('addMessage')
}
</script>

<template>
  <List @scroll="onScroll">
    <template v-slot:content>
      <Card class="message" v-for="message in messages" @click="replyTo(message)">
        <div class="header">
          <div class="name">{{ message.user.username }}</div>
          <div class="date">{{ formatDate(message.created_time) }}</div>
        </div>
        <div class="content">{{ message.content }}</div>
        <Gallery v-if="message.files.length" class="gallery" :images="message.files.map(f => f.thumb)"
          :onClick="clickImage"></Gallery>
        <div class="reply-wrapper" v-if="message.descendants?.length > 0">
          <div class="reply" v-for="reply in message.descendants" @click.stop="replyTo(reply)">
            <div class="header">
              <div class="name">{{ reply.user.username }}</div>
              <div class="name" v-if="getReplyToUsername(message, reply)">: {{ getReplyToUsername(message, reply) }}
              </div>
            </div>
            <div class="date">{{ formatDate(reply.created_time) }}</div>
            <div class="content">{{ reply.content }}</div>
          </div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.message {
  padding: 0.5rem 1rem;
  text-align: left;
  cursor: pointer;

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
  }

  .content {
    font-size: 15px;
    white-space: break-spaces;
  }

  .gallery {
    margin-top: 1rem;
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
      box-shadow: 1px 2px 6px 1px #eee;

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
