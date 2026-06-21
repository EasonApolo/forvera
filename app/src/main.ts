import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from './store/user'
import App from './App.vue'
import Profile from './views/Profile.vue'
import MessageVue from './views/Message.vue'
import AddMessageVue from './views/AddMessage.vue'
import WriteVue from './views/Write.vue'
import PostVue from './views/Post.vue'
import PostListVue from './views/PostList.vue'
import CategoryVue from './views/Category.vue'
import Playground from './views/Playground.vue'
import SiteInfoVue from './views/Playground/SiteInfo.vue'
import TaxonomyVue from './views/Taxonomy.vue'
import RequirementsVue from './views/Requirements.vue'
import HomeVue from './views/Home.vue'
import RatingVue from './views/Rating.vue'
import HoldemVue from './views/Holdem.vue'
import HoldemRoomVue from './views/HoldemRoom.vue'
import GomokuVue from './views/Gomoku.vue'
import GomokuRoomVue from './views/GomokuRoom.vue'
import LoginVue from './views/Login.vue'
import ExpiryCheckerVue from './views/Playground/ExpiryChecker.vue'
import DietVue from './views/Playground/Diet.vue'
import PetVue from './views/Pet.vue'
import UserManageVue from './views/UserManage.vue'

const routerOptions = {
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: HomeVue,
      children: [
        { path: '', redirect: { name: 'postList' } },
        { path: 'postList', component: PostListVue, name: 'postList' },
        { path: 'twit', component: MessageVue, name: 'twit' },
        { path: 'playground', component: Playground, name: 'playground' },
        {
          path: 'profile',
          component: Profile,
          name: 'profile',
          meta: { requiresAuth: true },
        },
      ],
    },
    { path: '/message', redirect: { name: 'twit' } },
    { path: '/login', component: LoginVue, name: 'login' },
    { path: '/addMessage', component: AddMessageVue, name: 'addMessage' },
    {
      path: '/write/:postId',
      component: WriteVue,
      name: 'write',
      meta: { requiresAuth: true },
    },
    { path: '/post/:postId', component: PostVue, name: 'post' },
    {
      path: '/category',
      component: CategoryVue,
      name: 'category',
      meta: { requiresAuth: true },
    },
    {
      path: '/user-manage',
      component: UserManageVue,
      name: 'userManage',
      meta: { requiresAuth: true },
    },
    { path: '/siteinfo', component: SiteInfoVue, name: 'siteinfo' },
    {
      path: '/taxonomy',
      component: TaxonomyVue,
      name: 'taxonomy',
    },
    {
      path: '/requirements',
      component: RequirementsVue,
      name: 'requirements',
      meta: { requiresAuth: true },
    },
    {
      path: '/expiry',
      component: ExpiryCheckerVue,
      name: 'expiry',
      meta: { requiresAuth: true },
    },
    { path: '/rating', component: RatingVue, name: 'rating' },
    { path: '/diet', component: DietVue, name: 'diet' },
    { path: '/holdem', component: HoldemVue, name: 'holdem' },
    { path: '/holdem/:id', component: HoldemRoomVue, name: 'holdemRoom' },
    { path: '/holdem/:id/:userId', component: HoldemRoomVue, name: 'holdemRoomWithUser' },
    { path: '/gomoku', component: GomokuVue, name: 'gomoku' },
    { path: '/gomoku/:id', component: GomokuRoomVue, name: 'gomokuRoom' },
    { path: '/gomoku/:id/:userId', component: GomokuRoomVue, name: 'gomokuRoomWithUser' },
    { path: '/pet', component: PetVue, name: 'pet' },
  ],
}

const pinia = createPinia()
export const router = createRouter(routerOptions)

router.beforeEach(async (to, from) => {
  const userStore = useUserStore(pinia)

  if (!userStore.userInfo.token && localStorage.token) {
    await userStore.getUserInfo()
  }

  if (to.meta.requiresAuth && !userStore.isLogin) {
    const source = from?.matched?.length ? from.fullPath : ''
    return {
      name: 'login',
      query: { redirect: to.fullPath, source },
    }
  }

  if (to.name === 'login' && userStore.isLogin) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : '/profile'
    return redirect
  }

  return true
})

const app = createApp(App)
app.use(router)
app.use(pinia)

app.mount('#app')
