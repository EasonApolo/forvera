<script setup lang="ts">
import { Swiper, SwiperSlide } from 'swiper/vue';
import 'swiper/css';
import PostList from './PostList.vue';
import Message from './Message.vue'
import PlayGround from './Playground.vue'
import Profile from './Profile.vue'
import { useMessageStore } from '@/store/message';
import { useMainStore } from '@/store/main';
import { computed, ref } from 'vue';

const messageStore = useMessageStore()
const mainStore = useMainStore()

let swiperInstance: any
const tabs = [
  { name: '文字', component: PostList },
  { name: '发言', component: Message },
  { name: 'playground', component: PlayGround },
  { name: '个人', component: Profile }
]
const onSwiper = (swiper: any) => {
  swiperInstance = swiper
}
const activeIndex = ref(0)
const onSlideChange = (swiper: any) => {
  activeIndex.value = swiper.activeIndex
}
const clickTab = (index: number) => {
  swiperInstance.slideTo(index)
}

const replyTo = () => {
  messageStore.reply()
  mainStore.router.push('addMessage')
}

</script>

<template>
  <swiper :slides-per-view="1" :space-between="50" @swiper="onSwiper" @slideChange="onSlideChange">
    <swiper-slide v-for="tab in tabs">
      <component v-bind:is="tab.component"></component>
    </swiper-slide>
  </swiper>

  <div class="nav">
    <div class="nav-item" v-for="(tab, index) in tabs" :class="{ 'active': activeIndex === index }"
      @click="clickTab(index)">
      <template v-if="index === 1">
        <div class="message">
          <div :class="{ 'move-up': activeIndex === index }">
            <div class="message-text" key="text">发言</div>
            <div class="message-icon" key="icon" @click="replyTo"></div>
          </div>
        </div>
      </template>
      <template v-else-if="index === 2">
        <div class="playground">
          <div>play</div>
          <div>ground</div>
        </div>
      </template>
      <template v-else>{{ tab.name }}</template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.swiper-slide {
  min-height: 100vh;
}

.nav {
  position: fixed;
  left: calc(50% - 8rem);
  width: 16rem;
  bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-around;
  border-radius: .5rem;
  background-color: white;
  box-shadow: 0px 2px 8px 0px #ccc;
  z-index: 2;

  .nav-item {
    position: relative;
    width: 2.5rem;
    padding: .5rem 0;
    line-height: 14px;
    transition: color .2s ease;
  }

  .active {
    color: #42b983;
  }

  .playground {
    font-size: 12px;
  }

  .message {
    position: absolute;
    width: 100%;
    top: -.75rem;
    height: 2.5rem;
    background-image: linear-gradient(rgba(255, 255, 255, 1), rgba(255, 255, 255, 0) 25%, rgba(255, 255, 255, 0) 75%, rgba(255, 255, 255, 1));
    isolation: isolate;
    overflow: hidden;

    & > div {
      margin: .75rem auto 0;
      transition: transform .3s ease-out;
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
      margin: .75rem auto 0;
      $size: 1.25rem;
      width: $size;
      height: $size;
      background: url(../assets/send.png) center/$size no-repeat;
      cursor: pointer;
    }
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: transform .3s ease-out, opacity .3s ease-out;
  }

  .fade-enter-from {
    transform: translateY(24px);
    opacity: 0;
  }

  .fade-leave-to {
    transform: translateY(-24px);
    opacity: 0;
  }
}
</style>
