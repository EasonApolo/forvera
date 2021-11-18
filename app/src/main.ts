import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import Profile from './views/Profile.vue'
import MessageVue from './views/Message.vue'

const router = {
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/message', component: MessageVue },
    { path: '/profile', component: Profile },
  ]
}

const app = createApp(App)
app.use(createRouter(router))
app.use(createPinia())

app.mount('#app')
