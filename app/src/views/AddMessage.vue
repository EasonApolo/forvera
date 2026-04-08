<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { reactive, ref, computed } from 'vue'
import Btn from '../components/Btn.vue'
import List from '../components/layout/List.vue'
import Card from '../components/Card.vue'
import { useMainStore } from '../store/main'
import { useMessageStore } from '../store/message'
import { useUserStore } from '../store/user'
import { readFile } from '../utils/common'
import { request } from '../utils/request'
import FileInput from '../components/FileInput.vue'
import DraggableGallery from '../components/DraggableGallery.vue'
import Textarea from '../components/Textarea.vue'
import { getUrlFromFD } from '../store/write'
import { useToastStore } from '../store/toast'

const props = withDefaults(defineProps<{ msg?: string; floating?: boolean }>(), {
  floating: false,
})
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'sent'): void
}>()

const [messageStore, userStore, toastStore, mainStore] = [
  useMessageStore(),
  useUserStore(),
  useToastStore(),
  useMainStore(),
]
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

const closePanel = () => {
  messageStore.clearMessageInput()
  if (props.floating) {
    emit('close')
    return
  }
  mainStore.router.go(-1)
}

// send message
const sendBtnContent = '发送'
const send = async () => {
  if (!messageInput.value.content.length) {
    toastStore.showToast({ content: '内容不能为空', type: 'ERR' })
    return
  }
  if (messageInput.value.content.length < 4) {
    toastStore.showToast({
      content: `内容少于${messageInput.value.content.length}个字也不行`,
      type: 'ERR',
    })
    return
  }
  loading.value.send = true
  const t1 = Date.now()
  const res = await messageStore.addMessage()
  loading.value.send = false
  if (res) {
    toastStore.showToast({ content: `发送成功～`, type: 'OK' })
  } else {
    let errContent = '发送失败，看看控制台'
    if (Date.now() - t1 > 3000) {
      errContent =
        '发送失败，好像等了很久，可能是后端超时或nginx超时或网不行或cloudflare不行'
    }
    toastStore.showToast({ content: errContent, type: 'ERR' })
  }
  messageStore.clearMessageInput()
  if (props.floating) {
    emit('sent')
    emit('close')
  } else {
    mainStore.router.go(-1)
  }
}

// anonymous
const toggleAnonymous = () => {
  if (!isLogin.value) return
  messageStore.$patch({
    messageWrapper: {
      anonymous: !messageWrapper.value.anonymous,
    },
  })
}

const loading = ref({ send: false })
</script>

<template>
  <div v-if="props.floating" class="floating-content">
    <Card class="input-wrapper">
      <div class="content">
        <div class="tips">
          - {{ userStore.isLogin ? '' : '当前未登录，登录后' }}可以{{
            messageWrapper.replyToUsername ? '' : '附带最多3张图片和'
          }}切换身份。<br />
          - 退出页面会清空，不要在这里打一堆字哦。<br />
          - 正在以{{
            messageWrapper.anonymous ? '随机' : userStore.userInfo.username
          }}身份{{
            messageWrapper.replyToUsername
              ? `回复${messageWrapper.replyToUsername}`
              : '发言'
          }}。<br />
        </div>
        <Textarea
          class="input text-input"
          v-model="messageInput.content"
          :rows="3"
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
          <Btn class="action" @click="closePanel">取消</Btn>
          <Btn class="action send" @click="send" :loading="loading.send">{{
            sendBtnContent
          }}</Btn>
          <div class="right">
            <FileInput
              v-if="
                !messageWrapper.anonymous && !messageWrapper.replyToUsername
              "
              :change="fileInputChange"
              :multiple="true"
            ></FileInput>
            <Btn
              class="action"
              @click="toggleAnonymous"
              :type="messageWrapper.anonymous ? 'primary' : undefined"
              >{{ messageWrapper.anonymous ? '匿名中' : '启用匿名' }}</Btn
            >
          </div>
        </div>
      </div>
      <div class="icon"></div>
    </Card>
  </div>
  <List v-else>
    <template #content>
      <Card class="input-wrapper">
        <div class="content">
          <div class="tips">
            - {{ userStore.isLogin ? '' : '当前未登录，登录后' }}可以{{
              messageWrapper.replyToUsername ? '' : '附带最多3张图片和'
            }}切换身份。<br />
            - 退出页面会清空，不要在这里打一堆字哦。<br />
            - 正在以{{
              messageWrapper.anonymous ? '随机' : userStore.userInfo.username
            }}身份{{
              messageWrapper.replyToUsername
                ? `回复${messageWrapper.replyToUsername}`
                : '发言'
            }}。<br />
          </div>
          <Textarea
            class="input text-input"
            v-model="messageInput.content"
            :rows="3"
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
            <Btn class="action send" @click="send" :loading="loading.send">{{
              sendBtnContent
            }}</Btn>
            <div class="right">
              <FileInput
                v-if="
                  !messageWrapper.anonymous && !messageWrapper.replyToUsername
                "
                :change="fileInputChange"
                :multiple="true"
              ></FileInput>
              <Btn
                class="action"
                @click="toggleAnonymous"
                :type="messageWrapper.anonymous ? 'primary' : undefined"
                >{{ messageWrapper.anonymous ? '匿名中' : '启用匿名' }}</Btn
              >
            </div>
          </div>
        </div>
        <div class="icon"></div>
      </Card>
    </template>
  </List>
</template>

<style lang="less" scoped>
.input-wrapper {
  .actions {
    display: flex;
    margin: .5rem auto 0;
    align-items: center;
    justify-content: space-between;
    column-gap: 0.5rem;

    .send {
      flex: 0 0 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    > .action + .action {
      margin-left: 0.5rem;
    }

    .right {
      margin-left: auto;
      display: flex;
      align-items: center;
      column-gap: 0.75rem;
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
