<template>
  <div id="app">
    <theme-provider :theme="getTheme">
      <notify :content='"给劲"'></notify>
      <keep-alive include="home,twit,playground,profile" exclude="edit">
        <router-view/>
      </keep-alive>
      <pop></pop>
      <div id="nav">
        <ul id="nav-content">
          <router-link to="/"><v-btn text plain>文章</v-btn></router-link>
          <router-link to="/twit"><v-btn text plain>发言</v-btn></router-link>
          <router-link to="/playground"><v-btn text plain>游乐园</v-btn></router-link>
          <router-link to="/profile"><v-btn text plain>账户</v-btn></router-link>
        </ul>
      </div>
    </theme-provider>
  </div>
</template>

<script>
import Pop from '@/components/Pop'
import { request } from './shared/Request'
import { ThemeProvider } from 'vue-styled-components'
import { theme } from '@/shared/theme.js'
import Notify from '@/components/Notify.vue'

export default {
  data () {
    return {
      transitionName: '',
      theme: theme,
      use_theme: 'light',
    }
  },
  components: {
    Pop,
    'theme-provider': ThemeProvider,
    'notify': Notify
  },
  computed: {
    getTheme () {
      return this.theme[this.use_theme]
    },
  },
  mounted () {
    this.loginTransaction()
  },
  methods: {
    async loginTransaction () {
      this.$store.commit('setToken', localStorage.token)
      let status = await this.checkStatus()
      console.log(`[App] startup login status: ${status}`)
      if (status) {
        this.$store.commit('login', true)
        let userInfo = await request('user/info', 'POST')
        this.$store.commit('setUserInfo', userInfo)
      }
    },
    async checkStatus () {
      const res = await request('auth/status', 'POST')
      return !res.hasOwnProperty('ERRNO')
    },
  }
}
</script>

<style lang="scss">
html {
  overflow-y: scroll;
}
body {
  margin: 0;
  -webkit-overflow-scrolling: touch;
  -webkit-tap-highlight-color:rgba(0,0,0,0);
}
div, a, button, span, li {
  -webkit-tap-highlight-color:rgba(0,0,0,0);
}
input, textarea {
  display: block;
  padding: 0;
  border: none;
  background-color: transparent;
  outline: none;
  border-radius: 0;
  -webkit-appearance: none;
  font-size: .875rem;
  resize: none;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
}
a {
  color: #2c3e50;
  text-decoration: none;
}
ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
}
#app {
  position: relative;
  margin: 0 auto;
  max-width: 40rem;
  height: 100%;
  text-align: center;
  color: #2c3e50;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
/*这个好像必须要有，height可以没有*/
::-webkit-scrollbar {
  width: 10px;
}
/*滚动条背景*/
::-webkit-scrollbar-track-piece {
  background-color: #fff; 
  border-radius: 0;
}
/*垂直滚动条的样式*/
::-webkit-scrollbar-thumb:vertical { 
    background-color: #ccc;
    border-radius: 16px;
    outline: 2px solid #fff;
    outline-offset: -2px;
    border: 2px solid #fff;
}
@media (min-width: 750px) {
  #nav {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    right: 0;
    bottom: 0;
    width: 40rem;
    height: 3.25rem;
    z-index: 1;
    #nav-content {
      display: flex;
      justify-content: space-around;
      margin: .5rem auto;
      max-width: 24rem;
      border-radius: .75rem;
      box-shadow: 0 0 10px 1px #e8e8e8;
      background: white;
    }
  }
}
@media (max-width: 750px) {
  #app {
    display: flex;
    flex-direction: column;
  }
  #nav {
    position: relative;
    padding-bottom: 1rem;
    width: 100%;
    height: 3rem;
    background-color: #fff;
    border-top: 1px solid #eee;
    z-index: 1;
    #nav-content {
      display: flex;
      a {
        flex: 1 1 auto;
        height: 100%;
        line-height: 3rem;
        display: inline-block;
        transition: .3s;
        border-radius: 1rem;
        font-family: 'Courier';
      }
      a.router-link-exact-active {
        font-weight: bold;
      }
    }
  }
}
</style>