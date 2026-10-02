<script setup lang="ts">
import AddMessage from './AddMessage.vue'
import { useMessageStore } from '@/store/message'
import { computed, ref } from 'vue'
import { usePostStore } from '@/store/post'
import Loading from '@/components/Loading.vue'
import Modal from '@/components/Modal.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import { RouterView, useRoute, useRouter } from 'vue-router'

const messageStore = useMessageStore()
const postStore = usePostStore()
const route = useRoute()
const router = useRouter()

const tabs = [
  { label: '文字', routeName: 'postList' },
  { label: '发言', routeName: 'twit' },
  { label: 'playground', routeName: 'playground' },
  { label: '个人', routeName: 'profile' },
]
const showReplyPanel = ref(false)

const isLoadingPosts = ref(false)
const activeRouteName = computed(() => `${route.name || 'postList'}`)
const navItems = computed(() =>
  tabs.map(tab => ({
    key: tab.routeName,
    label: tab.label,
    active: activeRouteName.value === tab.routeName,
    href: `/${tab.routeName === 'postList' ? '' : tab.routeName}`.replace(/\/$/, ''),
  }))
)

const clickTab = async (routeName: string) => {
  if (routeName === 'twit' && activeRouteName.value === 'twit') {
    replyTo()
    return
  }
  if (routeName === 'postList' && activeRouteName.value === 'postList') {
    if (isLoadingPosts.value) {
      return
    }
    isLoadingPosts.value = true
    await postStore.fetchPosts()
    setTimeout(() => (isLoadingPosts.value = false), 1000)
    return
  }
  router.push({ name: routeName })
}

const isTabRoute = computed(() => tabs.some((tab) => tab.routeName === activeRouteName.value))

const replyTo = () => {
  messageStore.reply()
  showReplyPanel.value = true
}

const closeReplyPanel = () => {
  showReplyPanel.value = false
  messageStore.clearMessageInput()
}
</script>

<template>
  <div class="tab-content">
    <RouterView />
  </div>

  <BottomNavBar v-if="isTabRoute" :items="navItems" @select="clickTab">
    <template #item-postList>
        <div v-if="!isLoadingPosts">文字</div>
        <Loading class="tab-loading" v-else />
    </template>
    <template #item-twit>
        <div class="message">
          <div :class="{ 'move-up': activeRouteName === 'twit' }">
            <div class="message-text" key="text">发言</div>
            <div class="message-icon" key="icon" @click.stop.prevent="replyTo"></div>
          </div>
        </div>
    </template>
    <template #item-playground>
        <div class="playground">
          <div>play</div>
          <div>ground</div>
        </div>
    </template>
  </BottomNavBar>

  <Modal
    :show="showReplyPanel"
    @update:show="closeReplyPanel"
    placement="bottom"
    :padding-bottom="false"
    :blur-backdrop="false"
    :hide-footer="true"
    :max-width="560"
  >
    <AddMessage :floating="true" @close="closeReplyPanel" />
  </Modal>
</template>

<style lang="less" scoped>
.tab-content {
  height: 100vh;
  overflow: hidden;
}

.tab-loading {
  width: 1.5rem;
  height: 1.5rem;
}

.playground {
  font-size: 12px;
}

.message {
  position: absolute;
  width: 100%;
  height: 2.5rem;
  background-image: linear-gradient(
    rgba(var(--card-bg-rgb), 1),
    rgba(var(--card-bg-rgb), 0) 25%,
    rgba(var(--card-bg-rgb), 0) 75%,
    rgba(var(--card-bg-rgb), 1)
  );
  isolation: isolate;
  overflow: hidden;

  & > div {
    margin: 0.75rem auto 0;
    transition: transform 0.3s ease-out;
    mix-blend-mode: overlay;
  }
  .move-up {
    transform: translateY(calc(-1.75rem - 2px));
  }
  .message-text {
    height: 1rem;
    line-height: 1rem;
  }

  .message-icon {
    margin: 0.75rem auto 0;
    @size: 1.25rem;
    width: @size;
    height: @size;
    background: url(../assets/send.png) center/ @size no-repeat;
    cursor: pointer;
  }
}

</style>
