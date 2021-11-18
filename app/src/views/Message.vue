<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { useMainStore } from '../store/storeMain';
import Card from '../components/Card.vue';
import { formatDate, readFile } from '../utils/common';
import { reactive, ref } from 'vue';

const mainStore = useMainStore()
const { messages, isLogin, messageInput, messageWrapper } = storeToRefs(mainStore)

mainStore.fetchMessages()

const fileInput = ref({ files: [] })

const allSelectedImages: Array<{ file: File, blob: string }> = reactive([])
const fileInputChange = async () => {
  const files: Array<File> = [...fileInput.value!.files]
  const blobs = await Promise.all(files.map(readFile))
  const selected = files.map((file, index) => ({ file, blob: blobs[index] }))
  allSelectedImages.push(...selected)
  mainStore.messageInput.files = allSelectedImages.map(obj => obj.file)
}

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

const send = () => {
  mainStore.addMessage()
}

const replyTo = (message: Message) => {
  const parent = message._id
  const ancestor = message.level === 0 ? message._id : message.ancestor
  console.log(parent, ancestor)
  mainStore.$patch({
    messageInput: {
      parent,
      ancestor
    },
    messageWrapper: {
      replyToUsername: message.user.username
    }
  })
}
const cancelReply = () => {
  mainStore.$patch({
    messageInput: {
      parent: '',
      ancestor: ''
    },
    messageWrapper: {
      replyToUsername: ''
    }
  })
}
</script>

<template>
  <Card class="input-wrapper">
    <input class="input" v-model="messageInput.content" />
    <input type="file" @change="fileInputChange" ref="fileInput" multiple />
    <div class="gallery">
      <img class="image" :src="img.blob" v-for="img in allSelectedImages" />
    </div>
    <div class="actions">
      <div class="action send" @click="send">{{ messageWrapper.replyToUsername ? `回复${messageWrapper.replyToUsername}` : '发送'}}</div>
      <div class="action" v-if="messageInput.parent" @click="cancelReply">取消回复</div>
      <div class="action">匿名</div>
    </div>
  </Card>
  <Card class="message" v-for="message in messages" @click="replyTo(message)">
    <div class="header">
      <div class="name">{{ message.user.username }}</div>
      <div class="date">{{ formatDate(message.created_time) }}</div>
    </div>
    <div class="content">{{ message.content }}</div>
    <div class="gallery">
      <img class="image" :src="file.thumb" v-for="file in message.files" />
    </div>
    <div class="reply-wrapper">
      <div class="reply" v-for="reply in message.descendants" @click.stop="replyTo(reply)">
        <div class="reply-header">
          <div class="name">{{ reply.user.username }}</div>
          <div
            class="name"
            v-if="getReplyToUsername(message, reply)"
          >: {{ getReplyToUsername(message, reply) }}</div>
        </div>
        <div class="date">{{ formatDate(reply.created_time) }}</div>
        <div class="content">{{ reply.content }}</div>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.input-wrapper {
  position: fixed;
  left: 1rem;
  right: 1rem;
  bottom: 4rem;
  box-shadow: 1px 1px 10px 1px #eee;
}
.input-wrapper .input {
}
.input-wrapper .actions {
  display: flex;
  margin: 0 auto;
  width: 18rem;
  justify-content: space-between;
}
.input-wrapper .actions .action {
  padding: 0 1rem;
}
.input-wrapper .actions .send {
  flex: 0 0 auto;
  max-width: 6rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.message {
  padding: 0.5rem 1rem;
  text-align: left;
}
.message .header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.message:not(:first-child) {
  margin-top: 0.5rem;
}
.message .name {
  font-weight: 700;
}
.message .date {
  font-size: 12px;
  color: #aaa;
}
.message .content {
  font-size: 15px;
}
.gallery {
  display: flex;
  align-items: flex-start;
  margin-top: 0.5rem;
}
.gallery .image {
  margin-right: 0.5rem;
  width: 6rem;
  border-radius: 0.5rem;
}
.reply-wrapper {
  display: flex;
  flex-wrap: wrap;
  /* justify-content: space-between; */
}
.reply {
  margin: 0 1rem 0.75rem 0;
  padding: 0.25rem 0.5rem;
  border-radius: 0.5rem;
  box-shadow: 1px 2px 6px 1px #eee;
}
.reply-header {
  display: flex;
}
.reply-header div:not(:last-child) {
  margin-right: 0.125rem;
}
.reply .name {
  font-size: 12px;
  font-weight: 200;
}
.reply .content {
  font-size: 16px;
}
</style>
