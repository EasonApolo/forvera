<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { usePostDetail } from '../store/postDetail'
import { useCategories } from '../store/category'
import { formatDate } from '../utils/common'
import Skeleton from '@/components/layout/Skeleton.vue'
import GreyText from '../components/GreyText.vue'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useImageStore } from '@/store/image'

const [postDetailStore, categoryStore] = [usePostDetail(), useCategories()]
const imageStore = useImageStore()
const route = useRoute()
const router = useRouter()
const { post } = storeToRefs(postDetailStore)
categoryStore.init()
const contentRef = ref<HTMLElement | null>(null)
const tocExpanded = ref(false)
const tocList = ref<{ id: string; title: string; level: number }[]>([])
const activeTocId = ref('')
let headingEls: HTMLElement[] = []
let scrollTicking = false
let scrollContainerEl: HTMLElement | null = null

const bindScrollListener = () => {
  if (scrollContainerEl) {
    scrollContainerEl.removeEventListener('scroll', onContainerScroll)
    scrollContainerEl = null
  }
  window.removeEventListener('scroll', onContainerScroll)

  const fromContent = contentRef.value?.closest('.component-list') as HTMLElement | null
  const byQuery = document.querySelector('.component-list') as HTMLElement | null
  scrollContainerEl = fromContent || byQuery

  if (scrollContainerEl) {
    scrollContainerEl.addEventListener('scroll', onContainerScroll, { passive: true })
  } else {
    window.addEventListener('scroll', onContainerScroll, { passive: true })
  }
}
const navItems = computed(() => {
  const items = [{ key: 'back', label: '‹ 返回' }]
  if (tocList.value.length > 0) {
    items.push({ key: 'toc', label: '目录', active: tocExpanded.value })
  }
  return items
})

const buildPostEnhancements = async () => {
  await nextTick()
  const container = contentRef.value
  if (!container) {
    tocList.value = []
    headingEls = []
    activeTocId.value = ''
    return
  }

  bindScrollListener()

  const headings = Array.from(
    container.querySelectorAll('.h1, .h2, .h3, .h4')
  ) as HTMLElement[]
  headingEls = headings
  tocList.value = headings.map((heading, index) => {
    const id = `post-toc-${index}`
    heading.id = id
    return {
      id,
      title: heading.textContent?.trim() || `标题 ${index + 1}`,
      level: Number(heading.className.replace('h', '')) || 3,
    }
  })

  activeTocId.value = tocList.value[0]?.id || ''

  const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[]
  images.forEach(image => {
    image.style.cursor = 'zoom-in'
    image.onclick = (event) => {
      event.stopPropagation()
      imageStore.preview(image.src)
    }
  })

  syncActiveTocByScroll()
}

const scrollActiveTocIntoView = () => {
  if (!activeTocId.value) return
  const selector = `.toc-item[data-toc-id="${activeTocId.value}"]`
  const items = document.querySelectorAll(selector)
  items.forEach((item) => {
    const el = item as HTMLElement
    const list = el.closest('.toc-list') as HTMLElement | null
    if (!list) return
    const itemTop = el.offsetTop
    const itemBottom = itemTop + el.offsetHeight
    const viewTop = list.scrollTop
    const viewBottom = viewTop + list.clientHeight
    if (itemTop < viewTop + 8) {
      list.scrollTo({ top: Math.max(0, itemTop - 8), behavior: 'smooth' })
    } else if (itemBottom > viewBottom - 8) {
      list.scrollTo({ top: itemBottom - list.clientHeight + 8, behavior: 'smooth' })
    }
  })
}

const syncActiveTocByScroll = () => {
  if (!headingEls.length) return
  const threshold = 120
  let currentId = headingEls[0].id
  for (const heading of headingEls) {
    if (heading.getBoundingClientRect().top <= threshold) {
      currentId = heading.id
    } else {
      break
    }
  }
  if (currentId !== activeTocId.value) {
    activeTocId.value = currentId
    scrollActiveTocIntoView()
  }
}

const onContainerScroll = () => {
  if (scrollTicking) return
  scrollTicking = true
  requestAnimationFrame(() => {
    syncActiveTocByScroll()
    scrollTicking = false
  })
}

// Compute visual indent depth relative to actual parent chain in the TOC.
// Each item's depth = parent.depth + (item.level - parent.level), accumulated
// via a stack so that e.g. h4 directly under h2 gets depth 2 (2x indent).
const tocListWithDepth = computed(() => {
  const stack: { level: number; depth: number }[] = []
  return tocList.value.map(item => {
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop()
    }
    const depth = stack.length === 0
      ? 0
      : stack[stack.length - 1].depth + (item.level - stack[stack.length - 1].level)
    stack.push({ level: item.level, depth })
    return { ...item, depth }
  })
})

const scrollToHeading = (id: string) => {
  const target = document.getElementById(id)
  if (!target) return
  activeTocId.value = id
  scrollActiveTocIntoView()
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const onNavSelect = (key: string) => {
  if (key === 'back') {
    if (window.history.length > 1) {
      router.back()
    } else {
      router.push({ name: 'postList' })
    }
    return
  }

  if (key === 'toc' && tocList.value.length > 0) {
    tocExpanded.value = !tocExpanded.value
  }
}

watch(
  () => route.params.postId,
  postId => {
    if (typeof postId === 'string' && postId) {
      postDetailStore.init(postId)
    }
  },
  { immediate: true }
)

watch(
  () => post.value.content,
  () => {
    buildPostEnhancements()
  },
  { immediate: true }
)

onMounted(() => {
  nextTick(() => {
    bindScrollListener()
  })
})

onUnmounted(() => {
  if (scrollContainerEl) {
    scrollContainerEl.removeEventListener('scroll', onContainerScroll)
  }
  window.removeEventListener('scroll', onContainerScroll)
})

onBeforeRouteLeave(() => {
  postDetailStore.clear()
  return true
})
</script>

<template>
  <List>
    <template v-slot:content>
      <GreyText>by {{ post.author?.username || '' }}</GreyText>
      <Card>
        <Skeleton v-if="!post._id" />
        <div class="meta" v-else>
          <div class="left">
            <div class="title">{{ post.title }}</div>
            <div class="categories">
              {{
                categoryStore.mapCategoryName(post.category || []).join(' / ')
              }}
            </div>
          </div>
          <div class="right">
            <div class="time" v-if="post.created_time !== post.updated_time">
              => {{ formatDate(post.updated_time) }}
            </div>
            <div class="time">{{ formatDate(post.created_time) }}</div>
          </div>
        </div>
      </Card>
      <Card class="main">
        <Skeleton v-if="!post._id" />
        <div v-else>
          <div class="description" v-if="post.description">
            {{ post.description }}
          </div>
          <div class="content" ref="contentRef" v-html="post.content"></div>
        </div>
      </Card>

      <div v-if="tocList.length > 0" class="toc toc-desktop">
        <div class="toc-title">目录</div>
        <div class="toc-list">
          <div
            class="toc-item"
            :class="{ active: activeTocId === item.id }"
            :data-toc-id="item.id"
            v-for="item in tocListWithDepth"
            :key="item.id"
            :style="{ paddingLeft: item.depth * 1.25 + 'rem' }"
            @click="scrollToHeading(item.id)"
          >
            {{ item.title }}
          </div>
        </div>
      </div>

      <div
        v-if="tocList.length > 0 && tocExpanded"
        class="toc toc-mobile"
      >
        <div class="toc-header">
          <div class="toc-title">目录</div>
        </div>
        <div class="toc-list">
          <div
            class="toc-item"
            :class="{ active: activeTocId === item.id }"
            :data-toc-id="item.id"
            v-for="item in tocListWithDepth"
            :key="`${item.id}-m`"
            :style="{ paddingLeft: item.depth * 1.25 + 'rem' }"
            @click="scrollToHeading(item.id)"
          >
            {{ item.title }}
          </div>
        </div>
      </div>

      <div class="ending" v-if="post">—— 完 ——</div>

      <BottomNavBar :items="navItems" @select="onNavSelect" />
    </template>
  </List>
</template>

<style scoped lang="less">
.meta {
  display: flex;
  align-items: center;
  text-align: left;

  .left {
    flex: 1 1 auto;
    .title {
      font-size: 18px;
    }
    .categories {
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-secondary);
    }
  }

  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex: 0 1 auto;
    .time {
      flex: 1 0 auto;
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}

.main {
  overflow: hidden;
  text-align: left;

  .content {
    display: flow-root;
    font-size: 15px;

    &::before {
      content: '';
      display: table;
    }

    > :first-child {
      margin-top: 0 !important;
    }
  }

  .description {
    padding: 0 0 0.5rem;
    margin-bottom: .5rem;
    font-size: 14px;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-light);
  }
}
.ending {
  margin-top: 1rem;
  margin-bottom: 4.5rem;
  font-size: 12px;
  color: #aaa;
}

.toc {
  box-sizing: border-box;
  border-radius: 8px;
  background: var(--card-bg);
  box-shadow: var(--toc-shadow);
  z-index: 9;
  transition: background-color 0.25s ease;

  .toc-title {
    font-size: 14px;
    font-weight: 700;
    text-align: left;
  }

  .toc-list {
    margin-top: 0.5rem;
    max-height: 50vh;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .toc-item {
    font-size: 13px;
    line-height: 1.5;
    color: var(--toc-item-color);
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.active {
      font-weight: 700;
      color: var(--text);
    }
  }

  .toc-item + .toc-item {
    margin-top: 0.25rem;
  }

  .toc-item.lv-2 {
    padding-left: 1.25rem;
  }

  .toc-item.lv-3 {
    padding-left: 2.5rem;
  }

  .toc-item.lv-4 {
    padding-left: 3.75rem;
  }
}

.toc-desktop {
  position: fixed;
  top: 96px;
  left: calc(50% + 387px);
  width: 220px;
  padding: 0.75rem;
}

.toc-mobile {
  display: none;
}

@media (max-width: 1200px) {
  .toc-desktop {
    display: none;
  }

  .toc-mobile {
    display: block;
    position: fixed;
    left: 0;
    right: 0;
    width: 350px;
    margin: 0 auto;
    bottom: 5.25rem;
    padding: 0.75rem;

    .toc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .toc-list {
      max-height: 30vh;
      scrollbar-gutter: stable both-edges;
    }
  }
}
</style>

<style lang="less">
code {
  display: block;
  margin: 1em 0;
  padding: 0.5rem 1rem;
  line-height: 18px;
  background-color: var(--code-bg);
  color: var(--text);
  white-space: pre-wrap;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
}
.h1,
.h2,
.h3,
.h4 {
  margin: 1em 0 0 0;
  font-weight: bold;
}
.h1 {
  line-height: 60px;
  font-size: 28px;
}
.h2 {
  line-height: 48px;
  font-size: 24px;
}
.h3 {
  line-height: 36px;
  font-size: 20px;
}
.h4 {
  line-height: 24px;
  font-size: 16px;
}

p,
.ul1,
.ul2,
.ul3,
.quote1,
.quote2,
.quote3 {
  line-height: 26px;
}

.ul1,
.ul2,
.ul3 {
  position: relative;
  &::before {
    content: '•';
    position: absolute;
    top: 0;
    width: 0.5rem;
  }
}

.ul1 {
  padding-left: 1rem;

  &::before {
    left: 0.25rem;
  }
}

.ul2 {
  padding-left: 2rem;

  &::before {
    left: 1.25rem;
  }
}

.ul3 {
  padding-left: 3rem;

  &::before {
    left: 2.25rem;
  }
}

.quote1,
.quote2,
.quote3 {
  margin: 0.75rem 0;
  padding: 0.5rem 0.75rem;
  color: var(--quote-text);
  border-left: 4px solid var(--quote-border);
  background: var(--quote-bg);
}

.quote2 {
  margin-left: 1rem;
}

.quote3 {
  margin-left: 2rem;
}

img {
  display: block;
  margin: 0 auto;
}
.image-description {
  display: block;
  font-style: italic;
  text-align: center;
  color: #aaa;
  font-size: 12px;
}
</style>
