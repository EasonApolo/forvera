import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Profile from './views/Profile.vue'
import MessageVue from './views/Message.vue'
import AddMessageVue from './views/AddMessage.vue'
import WriteVue from './views/Write.vue'
import PostVue from './views/Post.vue'
import PostListVue from './views/PostList.vue'
import CategoryVue from './views/Category.vue'
import Playground from './views/Playground.vue'
import BalanceVue from './views/Playground/Balance.vue'
import SiteInfoVue from './views/Playground/SiteInfo.vue'

const router = {
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: PostListVue },
    { path: '/message', component: MessageVue },
    { path: '/profile', component: Profile },
    { path: '/addMessage', component: AddMessageVue },
    { path: '/write', component: WriteVue },
    { path: '/post', component: PostVue },
    { path: '/category', component: CategoryVue },
    { path: '/playground', component: Playground },
    { path: '/balance', component: BalanceVue },
    { path: '/siteinfo', component: SiteInfoVue }
  ]
}

const app = createApp(App)
app.use(createRouter(router))
app.use(createPinia())

app.mount('#app')
