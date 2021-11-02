import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

export const store = new Vuex.Store({
  state: {
    token: undefined,
    login: false,
    user: {
      info: {}
    },
    note: {}
  },
  mutations: {
    setToken (state, newToken) {
      localStorage.token = newToken
      state.token = newToken
    },
    login (state, status) {
      state.login = status
    },
    setUserInfo (state, userInfo) {
      state.user.info = userInfo
    },

    // note
    notify (state, _note) {
      state.note = _note
    },
    clearNote (state) {
      state.note = {}
    },
    confirm (state) {
      if (state.note.name) {
        state.note.confirm = true
      } else console.log(`ERR: vuex confirm: note ${state.note} has no name.`)
    }
  },
  getters: {
    userInfo: state => {
      return state.user.info
    },
  }
})