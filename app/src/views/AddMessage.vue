<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { reactive, ref, computed } from 'vue'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import { useMainStore } from '../store/main'
import { useMessageStore } from '../store/message'
import { useUserStore } from '../store/user'
import { readFile } from '../utils/common'
import { request } from '../utils/request'
import Label from '../components/Label.vue'
import FileInput from '../components/FileInput.vue'
import DraggableGallery from '../components/DraggableGallery.vue'
import { getUrlFromFD } from '../store/write'
import { useToastStore } from '../store/toast'

defineProps<{ msg: string }>()

const [messageStore, userStore, toastStore, mainStore] = [useMessageStore(), useUserStore(), useToastStore(), useMainStore()]
const { messageInput, messageWrapper } = storeToRefs(messageStore)
const { isLogin } = storeToRefs(userStore)

// file input
const allSelectedImages: Array<SelectedImage> = reactive([])
const displayImages = computed(() => allSelectedImages.map(s => s.blob))
const fileInputChange = async (fileInput: HTMLInputElement) => {
  const files = fileInput!.files
  if (files?.length) {
    const fileArr = Array.from(files)
    const selected = await Promise.all(fileArr.map(readFile))
    allSelectedImages.push(...selected)
    messageStore.messageInput.files = allSelectedImages.map(obj => obj.file)
  }
}
const onDrag = (newIndex: number, oldIndex: number) => {
  const tmp = allSelectedImages.splice(oldIndex, 1)[0]
  allSelectedImages.splice(newIndex, 0, tmp)
  messageStore.messageInput.files = allSelectedImages.map(obj => obj.file)
}
const onRemove = (removeIndex: number) => {
  allSelectedImages.splice(removeIndex, 1)
  messageStore.messageInput.files = allSelectedImages.map(obj => obj.file)
}

const cancelReply = () => {
  messageStore.$patch({
    messageInput: {
      parent: '',
      ancestor: ''
    },
    messageWrapper: {
      replyToUsername: ''
    }
  })
}

// send message
const sendBtnContent = messageWrapper.value.replyToUsername ? `回复${messageWrapper.value.replyToUsername}` : '发送'
const send = async () => {
  if (!messageInput.value.content.length) { toastStore.showToast({ content: '内容不能为空', type: 'ERR' }); return }
  if (messageInput.value.content.length < 4) { toastStore.showToast({ content: `内容少于${messageInput.value.content.length}个字也不行`, type: 'ERR' }); return }
  const res = await messageStore.addMessage()
  toastStore.showToast({ content: `发送成功～`, type: 'OK' })
  mainStore.router.go(-1)
}

// anonymous
const toggleAnonymous = () => {
  if (!isLogin.value) return
  messageStore.$patch({
    messageWrapper: {
      anonymous: !messageWrapper.value.anonymous
    }
  })
}

</script>

<template>
  <Card class="input-wrapper">
    <div class="content">
      <div class="tips">
        - {{ userStore.isLogin ? '' : '当前未登录，登录后' }}可以{{ messageWrapper.replyToUsername ? '' : '附带最多3张图片和' }}切换身份。<br>
        - 退出页面会清空，不要在这里打一堆字哦。<br>
        - 正在以{{ messageWrapper.anonymous ? '随机' : userStore.userInfo.username }}身份{{ messageWrapper.replyToUsername ? `回复${messageWrapper.replyToUsername}` : '发言' }}。<br>
      </div>
      <textarea
        class="input text-input"
        v-model="messageInput.content"
        rows="3"
      />
      <DraggableGallery
        v-if="!messageWrapper.anonymous && displayImages?.length"
        :images="displayImages"
        class="gallery"
        :is-draggable="true"
        :onDrag="onDrag"
        :onRemove="onRemove"
      ></DraggableGallery>
      <div class="actions">
        <Btn
          class="action send"
          @click="send"
        >{{ sendBtnContent }}</Btn>
        <div class="right">
          <FileInput
            v-if="!messageWrapper.anonymous && !messageWrapper.replyToUsername"
            :change="fileInputChange"
            :multiple="true"
          ></FileInput>
          <Label
            class="action"
            @click="toggleAnonymous"
            :active="messageWrapper.anonymous"
          >{{ messageWrapper.anonymous ? '匿名中' : '启用匿名' }}</Label>
        </div>
      </div>
    </div>
    <div class="icon"></div>
  </Card>
</template>

<style lang="scss" scoped>
.input-wrapper {
  .actions {
    display: flex;
    margin: 1rem auto 0;
    align-items: center;
    justify-content: space-between;
    .send {
      flex: 0 0 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .right {
      margin-left: auto;
      display: flex;
      .action {
        margin-left: 1rem;
      }
    }
  }
  .gallery {
    margin-top: 1rem;
  }
  .content {
    transition: 0.05s ease-out;
    .tips {
      margin-bottom: 8px;
      text-align: left;
    }
  }
}
</style>
