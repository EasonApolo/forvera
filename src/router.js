import Vue from 'vue'
import Router from 'vue-router'
import Home from './views/Home.vue'

Vue.use(Router)

export default new Router({
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/about',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (about.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import(/* webpackChunkName: "about" */ './views/About.vue')
    },
    {
      path: '/art',
      name: 'art',
      component: () => import(/* webpackChunkName: "art" */ './views/Art.vue')
    },
    {
      path: '/twit',
      name: 'twit',
      component: () => import(/* webpackChunkName: "twit" */ './views/Twit.vue')
    },
    {
      path: '/tool',
      name: 'tool',
      component: () => import(/* webpackChunkName: "tool" */ './views/Tool.vue')
    }
  ],
  scrollBehavior (to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    } else {
      return { x: 0, y: 0 }
    }
  }
})