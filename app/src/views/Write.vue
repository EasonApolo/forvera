<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUserStore } from '../store/user'
import Btn from '../components/Btn.vue'
import Input from '../components/Input.vue'
import GreyText from '../components/GreyText.vue'
import { useMainStore } from '../store/main'
import { getUrlFromFD, useWriteStore } from '../store/write'
import { useCategories } from '../store/category'
import List from '../components/layout/List.vue'
import FileInput from '../components/FileInput.vue'
import Textarea from '../components/Textarea.vue'
import { readFile } from '../utils/common'
import { ref, watch } from 'vue'
import Gallery from '../components/DraggableGallery.vue'
import { useToastStore } from '../store/toast'
import { useRoute } from 'vue-router'

const [writeStore, categoryStore, toastStore, mainStore] = [
  useWriteStore(),
  useCategories(),
  useToastStore(),
  useMainStore(),
]
const { post, images, files } = storeToRefs(writeStore)
const { categories } = storeToRefs(categoryStore)
const route = useRoute()

const initByRoute = async (postId: string) => {
  await writeStore.init(postId)
  await writeStore.initUploadedImages()
}

watch(
  () => route.params.postId,
  postId => {
    if (typeof postId === 'string' && postId) {
      initByRoute(postId)
    }
  },
  { immediate: true }
)

categoryStore.init()

const hasCategory = (catId: string) => {
  return post.value.category?.includes(catId)
}
const toggleCat = writeStore.toggleCategory
const publish = async () => {
  const res = await writeStore.publish()
  if (res) {
    toastStore.showToast({ content: '已更新', type: 'OK' })
    mainStore.go('/')
  }
}
const deletePost = async () => {
  let res = confirm('确定要删除吗？')
  if (!res) return
  await writeStore.deletePost()
  toastStore.showToast({ content: '已删除～', type: 'OK' })
  mainStore.go('/')
}
const changeStatus = () => {
  writeStore.changeStatus()
}

// 图片相关
let selected = ref({} as SelectedImage)
const onSelectImage = async (fileInput: HTMLInputElement) => {
  const files = fileInput.files
  if (files?.length) {
    selected.value = await readFile(files[0])
  }
}
const upload = async () => {
  writeStore.uploadImage(selected.value.file)
}
const onClickImg = (index: number) => {
  const url = getUrlFromFD(files.value[index])
  linkForCopy.value = `<img src="${url}" width="auto">`
}
const linkForCopy = ref('')
const copy = (e: any) => {
  e.target.select()
  document.execCommand('Copy')
  toastStore.showToast({
    content: '已复制图片代码，请粘贴到文章中。',
    type: 'OK',
  })
}
</script>

<template>
  <List class="write-layout-list">
    <template v-slot:content>
      <div class="write-block">
        <GreyText>标题</GreyText>
        <Input v-model="post.title" />
      </div>
      <div class="write-block">
        <GreyText>描述</GreyText>
        <Input v-model="post.description" />
      </div>
      <div class="write-block">
        <Textarea v-model="post.content" :rows="15" />
      </div>
      <div class="write-block">
        <GreyText>图片</GreyText>
        <div class="image-input">
          <FileInput :change="onSelectImage" :multiple="false"></FileInput>
          <Btn class="upload-btn" @click="upload">上传</Btn>
          <img class="preview" :src="selected.blob" />
        </div>
        <Textarea
          class="copy-container text-input"
          v-if="linkForCopy"
          v-model="linkForCopy"
          readonly
          @click="copy"
          :rows="3"
        ></Textarea>
        <Gallery
          :images="images"
          :onClick="onClickImg"
          class="gallery"
          v-if="images.length > 0"
        ></Gallery>
      </div>
      <div class="write-block">
        <GreyText>选择标签</GreyText>
        <div class="categories">
          <Btn
            :type="hasCategory(cat._id) ? 'primary' : undefined"
            v-for="cat in categories"
            @click="toggleCat(cat._id)"
            >{{ cat.title }}</Btn
          >
        </div>
      </div>
      <div class="write-block actions">
        <Btn @click="publish">提交</Btn>
        <Btn @click="changeStatus" :type="post.status === 1 ? 'primary' : undefined">{{
          post.status === 1 ? '已公开' : '已隐藏'
        }}</Btn>
        <Btn @click="deletePost">删除</Btn>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
.write-layout-list {
  background-color: #fafafa;
}
.write-block {
  transition: background-color 0.25s ease;

  &:not(:first-child) {
    margin-top: 1rem;
  }
}
.actions {
  display: flex;
  justify-content: center;
  > div {
    margin-right: 1rem;
  }
}
.categories {
  display: flex;
  align-items: center;
  overflow: auto;
  div {
    flex: 0 0 auto;
  }
  div:not(:last-child) {
    margin-right: 1rem;
  }
}
.image-input {
  display: flex;
  align-items: center;
  .upload-btn {
    margin: 0 12px;
  }
  .preview {
    width: 6rem;
  }
}
.gallery {
  margin-top: 1rem;
}
.copy-container {
  margin-top: 1rem;
  border-radius: 4px;
  background-color: var(--btn-bg);
  word-break: break-all;
}
</style>
