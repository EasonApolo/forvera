import Vue from 'vue'
import App from './App.vue'
import router from './router'
import bus from './shared/bus'
import { store } from './store'
import vuetify from './plugins/vuetify'

Vue.config.productionTip = false

var vm = new Vue({
    store,
    bus,
    router,
    vuetify,
    render: h => h(App)
}).$mount('#app')

global.vm = vm
