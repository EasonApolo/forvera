<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useUserStore } from '../store/user'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import Input from '../components/Input.vue'
import GreyText from '../components/GreyText.vue'
import { useMainStore } from '../store/main'
import { getUrlFromFD, useWriteStore } from '../store/write'
import { usePostStore } from '../store/post'
import { useCategories } from '../store/category'
import List from '../components/layout/List.vue'
import Textarea from '../components/Textarea.vue'
import { computed, ref, watch } from 'vue'
import Gallery from '../components/Gallery.vue'
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
const contentTextareaRef = ref<HTMLTextAreaElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const imageUseCounts = ref<number[]>([])
const activeImageIndex = ref(-1)
const importModalVisible = ref(false)
const yuqueInput = ref('')
const importingYuque = ref(false)

const getContentTextarea = () => {
  if (contentTextareaRef.value) return contentTextareaRef.value
  const el = document.querySelector('textarea.content-textarea') as HTMLTextAreaElement | null
  if (el) {
    contentTextareaRef.value = el
  }
  return contentTextareaRef.value
}

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

const openImportModal = () => {
  const confirmed = confirm('导入文章会删除所有已有内容，是否继续？')
  if (!confirmed) return
  yuqueInput.value = ''
  importModalVisible.value = true
}

const closeImportModal = () => {
  if (importingYuque.value) return
  importModalVisible.value = false
}

const confirmImportYuque = async () => {
  const text = yuqueInput.value.trim()
  if (!text) {
    toastStore.showToast({ content: '请先粘贴内容', type: '!' })
    return
  }
  importingYuque.value = true
  try {
    const importAction = (writeStore as any).importArticleFromYuque
    if (typeof importAction === 'function') {
      await importAction.call(writeStore, text)
    } else {
      const postStore = usePostStore()
      await postStore.importFromYuque(writeStore.postId, text)
      await writeStore.init(writeStore.postId)
      await writeStore.initUploadedImages()
    }
    updateImageUseCounts()
    activeImageIndex.value = -1
    importModalVisible.value = false
    toastStore.showToast({ content: '导入完成', type: 'OK' })
  } finally {
    importingYuque.value = false
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
const openImagePicker = () => {
  imageInputRef.value?.click()
}

const onSelectImage = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toastStore.showToast({ content: '只能上传图片文件', type: '!' })
    input.value = ''
    return
  }

  await writeStore.uploadImage(file)
  updateImageUseCounts()
  input.value = ''
}
const onClickImg = async (index: number) => {
  const url = getUrlFromFD(files.value[index])
  const code = `<img src="${url}" width="auto">`
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(code)
  } else {
    const temp = document.createElement('textarea')
    temp.value = code
    temp.setAttribute('readonly', 'true')
    temp.style.position = 'fixed'
    temp.style.left = '-9999px'
    document.body.appendChild(temp)
    temp.select()
    document.execCommand('Copy')
    document.body.removeChild(temp)
  }
  toastStore.showToast({
    content: '已复制图片代码，请粘贴到文章中。',
    type: 'OK',
  })
}

const getImageTagMatches = (content: string) => {
  const list: Array<{ src: string; start: number; end: number }> = []
  const re = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) {
    list.push({
      src: (match[1] || '').trim(),
      start: match.index,
      end: re.lastIndex,
    })
  }
  return list
}

const updateImageUseCounts = () => {
  const matches = getImageTagMatches(post.value.content || '')
  imageUseCounts.value = images.value.map(url =>
    matches.reduce((sum, item) => sum + (item.src === url ? 1 : 0), 0),
  )
}

const updateActiveImageByCaret = (target?: HTMLTextAreaElement | null) => {
  const textarea = target || getContentTextarea()
  if (!textarea) return
  contentTextareaRef.value = textarea

  const caret = textarea.selectionStart || 0
  const matches = getImageTagMatches(post.value.content || '')
  const current = matches.find(item => caret >= item.start && caret <= item.end)
  if (!current) {
    activeImageIndex.value = -1
    return
  }

  activeImageIndex.value = images.value.findIndex(url => url === current.src)
}

const onContentBlur = (e: FocusEvent) => {
  updateImageUseCounts()
  updateActiveImageByCaret(e.target as HTMLTextAreaElement)
}

const onContentCaretChange = (e: Event) => {
  updateActiveImageByCaret(e.target as HTMLTextAreaElement)
}

const goToImageUsage = (index: number) => {
  const textarea = getContentTextarea()
  const url = images.value[index]
  if (!textarea || !url) return

  const matches = getImageTagMatches(post.value.content || '')
  const target = matches.find(item => item.src === url)
  if (!target) return

  const measureScrollTop = (charOffset: number) => {
    const style = getComputedStyle(textarea)
    const mirror = document.createElement('div')
    mirror.style.cssText = [
      `position:fixed`, `visibility:hidden`, `pointer-events:none`,
      `top:-9999px`, `left:-9999px`,
      `width:${textarea.clientWidth}px`,
      `padding:${style.padding}`,
      `border:${style.border}`,
      `box-sizing:${style.boxSizing}`,
      `font:${style.font}`,
      `line-height:${style.lineHeight}`,
      `white-space:pre-wrap`,
      `word-wrap:break-word`,
      `overflow-wrap:break-word`,
    ].join(';')
    const content = (post.value.content || '').slice(0, charOffset)
    mirror.textContent = content
    const marker = document.createElement('span')
    marker.textContent = '|'
    mirror.appendChild(marker)
    document.body.appendChild(mirror)
    const markerTop = marker.offsetTop
    document.body.removeChild(mirror)
    return Math.max(0, markerTop - textarea.clientHeight * 0.35)
  }

  const placeCaret = () => {
    textarea.setSelectionRange(target.start, target.start)
    textarea.scrollTop = measureScrollTop(target.start)
    updateActiveImageByCaret(textarea)
  }

  textarea.focus()
  requestAnimationFrame(() => {
    placeCaret()
    requestAnimationFrame(placeCaret)
  })
}

const removeImage = async (index: number) => {
  const file = files.value[index]
  if (!file?._id) return

  const used = imageUseCounts.value[index] || 0
  const tip = used > 0 ? `该图片在文中被引用 ${used} 次，确认删除？` : '确认删除该图片？'
  if (!confirm(tip)) return

  await writeStore.deleteImage(file._id)
  updateImageUseCounts()
  if (activeImageIndex.value === index) {
    activeImageIndex.value = -1
  }
}

watch(images, () => {
  updateImageUseCounts()
  if (activeImageIndex.value >= images.value.length) {
    activeImageIndex.value = -1
  }
})

watch(
  () => post.value.content,
  () => {
    updateActiveImageByCaret()
  },
)
</script>

<template>
  <List class="write-layout-list">
    <template v-slot:content>
      <Card class="write-card">
        <div class="write-block">
          <GreyText>标题和描述</GreyText>
          <Input style="margin-bottom: 0.5rem;" placeholder="标题" v-model="post.title" />
          <Input placeholder="描述" v-model="post.description" />
        </div>
        <div class="write-block">
          <GreyText>正文</GreyText>
          <Textarea
            class="content-textarea"
            v-model="post.content"
            :rows="15"
            @focus="onContentCaretChange"
            @click="onContentCaretChange"
            @keyup="onContentCaretChange"
            @blur="onContentBlur"
          />
          <div class="content-actions">
            <Btn @click="openImportModal">导入</Btn>
          </div>
        </div>
        <div class="write-block">
          <GreyText>图片</GreyText>
          <div class="image-input">
            <Btn class="upload-btn" @click="openImagePicker">上传</Btn>
            <input
              ref="imageInputRef"
              class="image-input-file"
              type="file"
              accept="image/*"
              @change="onSelectImage"
            />
          </div>
          <Gallery
            :images="images"
            :onClick="(_, index) => onClickImg(index)"
            :badges="imageUseCounts"
            :activeIndex="activeImageIndex"
            :onBadgeClick="goToImageUsage"
            :onDelete="removeImage"
            :pointerOnHover="true"
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
      </Card>
      <div class="write-block actions">
        <Btn @click="publish">提交</Btn>
        <Btn @click="changeStatus" :type="post.status === 1 ? 'primary' : undefined">{{
          post.status === 1 ? '已公开' : '已隐藏'
        }}</Btn>
        <Btn @click="deletePost">删除</Btn>
      </div>

      <div v-if="importModalVisible" class="import-mask" @click.self="closeImportModal">
        <div class="import-modal">
          <div class="import-title">copy from 语雀</div>
          <Textarea v-model="yuqueInput" :rows="10" placeholder="粘贴语雀内容" />
          <div class="import-actions">
            <Btn @click="closeImportModal">取消</Btn>
            <Btn type="primary" :loading="importingYuque" @click="confirmImportYuque">确认</Btn>
          </div>
        </div>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
.write-layout-list {
  background-color: var(--bg);
}
.write-card {
  text-align: left;
}
.write-block {
  transition: background-color 0.25s ease;

  &:not(:first-child) {
    margin-top: .5rem;
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
}

.upload-btn {
  margin: 0 12px 0 0;
}

.image-input-file {
  display: none;
}
.gallery {
  margin-top: 1rem;
}

.content-actions {
  margin-top: 0.5rem;
  display: flex;
  justify-content: flex-start;
}

.import-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 120;
}

.import-modal {
  width: min(36rem, calc(100vw - 1rem));
  margin: 0.5rem;
  border-radius: 0.5rem;
  background-color: var(--card-bg);
  padding: 0.75rem;
}

.import-title {
  text-align: left;
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 0.6rem;
}

.import-actions {
  margin-top: 0.7rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
