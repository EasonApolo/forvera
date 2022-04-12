<script setup lang="ts">
import { storeToRefs } from 'pinia';
import Card from '../components/Card.vue';
import { useUserStore } from '../store/user';
import Btn from '../components/Btn.vue';
import { useMainStore } from '../store/main';
import { getUrlFromFD, useWriteStore } from '../store/write';
import { useCategories } from '../store/category';
import List from '../components/layout/List.vue';
import Label from '../components/Label.vue';
import FileInput from '../components/FileInput.vue'
import { readFile } from '../utils/common';
import { ref } from 'vue'
import Gallery from '../components/DraggableGallery.vue';
import { useToastStore } from '../store/toast';

const [writeStore, categoryStore, toastStore, mainStore] = [useWriteStore(), useCategories(), useToastStore(), useMainStore()]
const { post, images, files } = storeToRefs(writeStore)
const { categories } = storeToRefs(categoryStore)
writeStore.initUploadedImages()
categoryStore.init()

const hasCategory = (catId: string) => {
  return post.value.category?.includes(catId)
}
const toggleCat = writeStore.toggleCategory
const publish = async () => {
  const res = await writeStore.publish()
  if (res) {
    toastStore.showToast({ content: '已更新', type: 'OK' })
    mainStore.go('profile')
  }
}
const deletePost = async () => {
  let res = confirm('确定要删除吗？')
  if (!res) return
  await writeStore.deletePost()
  toastStore.showToast({ content: '已删除～', type: 'OK' })
  mainStore.go('profile')
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
  document.execCommand("Copy")
  toastStore.showToast({ content: '已复制图片代码，请粘贴到文章中。', type: 'OK' })
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card>
        <template v-slot:title>标题</template>
        <input class="text-input" v-model="post.title" />
      </Card>
      <Card>
        <template v-slot:title>描述</template>
        <input class="text-input" v-model="post.description" />
      </Card>
      <Card>
        <textarea class="text-input textarea" v-model="post.content"></textarea>
      </Card>
      <Card>
        <template v-slot:title>选择标签</template>
        <div class="categories">
          <Label
            :active="hasCategory(cat._id)"
            v-for="cat in categories"
            @click="toggleCat(cat._id)"
          >{{ cat.title }}</Label>
        </div>
      </Card>
      <Card>
        <template v-slot:title>图片</template>
        <div class="image-input">
          <FileInput :change="onSelectImage" :multiple="false"></FileInput>
          <Btn class="upload-btn"  @click="upload">上传</Btn>
          <img class="preview" :src="selected.blob" />
        </div>
        <textarea class="copy-container text-input" v-if="linkForCopy" v-model="linkForCopy" readonly @click="copy" rows="3"></textarea>
        <Gallery :images="images" :onClick="onClickImg" class="gallery" v-if="images.length > 0"></Gallery>
      </Card>
      <Card class="actions">
        <Btn @click="publish">提交</Btn>
        <Label @click="changeStatus" :active="post.status === 1">{{post.status === 1 ? '已公开' : '已隐藏'}}</Label>
        <Btn @click="deletePost">删除</Btn>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.item {
  &:not(:first-child) {
    margin-top: 0.5rem;
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
  background-color: #eee;
  word-break: break-all;
}
</style>
