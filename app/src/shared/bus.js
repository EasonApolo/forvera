
import Vue from 'vue'

var eventBus = {
    install(Vue,options) {
        Vue.prototype.$bus = new Vue()
    }
};
Vue.use(eventBus);