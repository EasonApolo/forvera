import Vue from 'vue'
import Router from 'vue-router'
import Home from './views/Home.vue'

Vue.use(Router)

export default new Router({
    routes: [{
            path: '/',
            name: 'home',
            component: Home
        },
        {
            path: '/profile',
            name: 'profile',
            component: () =>
                import ('./views/Profile.vue')
        },
        {
            path: '/post',
            name: 'post',
            component: () =>
                import ('./views/Post.vue')
        },
        {
            path: '/twit',
            name: 'twit',
            component: () =>
                import ('./views/Twit.vue')
        },
        {
            path: '/playground',
            name: 'playground',
            component: () =>
                import ('./views/Playground.vue')
        },
        {
            path: '/edit',
            name: 'edit',
            component: () =>
                import ('./views/Edit.vue')
        },
        {
            path: '/cats',
            name: 'cats',
            component: () =>
                import ('./views/Cats.vue')
        }
    ],
    scrollBehavior(to, from, savedPosition) {
        if (savedPosition) {
            return savedPosition
        } else {
            return { x: 0, y: 0 }
        }
    }
})