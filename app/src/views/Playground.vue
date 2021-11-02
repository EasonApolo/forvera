<template>
  <div class="tools">
    <layout v-if="active==undefined">
      <template #main>
        <list>
          <template #list>
            <div class="item tool" v-for="(tool, index) in tools" :key="index" @click="active=tool" :class="tool">
              {{toolName[tool]}}
            </div>
            <div class='item'>
              <div class='head'>最近更新</div>
              <Loading :intSwitch=switcher.commit></Loading>
              <div class='li' v-for="([v, ls], i) in commits" :key='i'>
                <div class='v'>{{v}}</div>
                <div class='l'><div v-for="(l, j) in ls" :key="j">{{l}}</div></div>
              </div>
            </div>
            <div class='item'>
              <div class='head'>Todo List</div>
              <Loading :intSwitch=switcher.todo></Loading>
              <div v-for="(li, i) in todos" :key='i'>
                <div class='li' v-for="([p, c], j) in li" :key='j'>
                  <div class='v'>{{p}}</div><div class='l'>{{c}}</div>
                </div>
              </div>
            </div>
            <div class='item'>
              <div class="head">统计</div>
              <div id="chart" class="block">
                <Loading :intSwitch=switcher.chart></Loading>
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg">  
                  <defs>
                    <linearGradient id="orange_red" x1="0%" y1="100%" x2="0%" y2="0%">
                      <stop offset="0%" style="stop-color:rgb(225, 225, 255);
                      stop-opacity:1"/>
                      <stop offset="100%" style="stop-color:rgb(100,100,255);
                      stop-opacity:1"/>
                    </linearGradient>
                  </defs>
                  <polyline :points=points
                  style="fill:transparent;stroke:url(#orange_red);stroke-width:2"/>
                </svg>
                <div class="years"><span v-for="year in years" :key="year" class="year">{{year}}</span></div>
              </div>
            </div>
          </template>
        </list>
      </template>
      <template #right>
        <rbox :title='"Contacts"'>
          <template #list>
            <a class='item github' href="https://github.com/EasonApolo"><span></span><div>GitHub</div></a>
            <a class='item gmail' href="mailto:waterlilyapolo@gmail.com"><span></span><div>Gmail</div></a>
          </template>
        </rbox>
      </template>
    </layout>
    <component v-if='active' v-bind:is="active"></component>
  </div>
</template>

<script>
import ToolRegex from '../components/ToolRegex'
import ToolRecord from '../components/ToolRecord'
import ToolChess from '../components/ToolChess'
import ToolMofish from '../components/ToolMofish'
import Layout from '@/components/Layout.vue'
import Rbox from '@/components/Rbox.vue'
import List from '@/components/List.vue'
import Loading from '@/components/Loading.vue'
export default {
  name: 'playground',
  components: {
    'regex': ToolRegex,
    'record': ToolRecord,
    'chess': ToolChess,
    'mofish': ToolMofish,
    'layout': Layout,
    'rbox': Rbox,
    'list': List,
    Loading,
  },
  data () {
    return {
      active: undefined,
      tools: ['regex', 'record', 'chess', 'mofish'],
      toolName: {
        regex: '正则提取',
        record: '录音机',
        chess: '自走棋',
        mofish: '摸鱼',
      },
      switcher: {
        chart: 0,
        todo: 0,
        commit: 0,
      },
      points: '',
      posts: [],
      years: [],
      todos: [],
      commits: [],
    }
  },
  mounted () {
    this.$bus.$on('goback', () => this.active = undefined)
    this.fetchData()
    this.fetchTodo()
    this.fetchCommit()
  },
  methods: {
    back () {
      this.active = undefined
    },
    fetchData () {
      this.switcher.chart = 1
      fetch(window.ip + 'posts?context=embed&per_page=' + 100)
      .then(res => {
        return res.json()
      }).then(json => {
        this.posts = json
        this.switcher.chart = 0
        this.process()
      })
    },
    process () {
      let svgWidth = document.getElementById('chart').offsetWidth
      let startYear = 2016
      let endYear = (new Date()).getFullYear()+1
      let month = []
      for(let i = this.posts.length - 1; i >= 0; i--) {
        let date = this.posts[i].date.slice(0, 7).split('-')
        if (i === this.posts.length - 1) startYear = parseInt(date[0])
        if (i === 0) endYear = parseInt(date[0]) + 1
        month.push((parseInt(date[0])-startYear)*12+parseInt(date[1]))
      }
      for (let i = startYear; i <= endYear; i++) {
        this.years.push(i)
      }
      let y = Array((endYear-startYear)*12).fill(0)
      for(let i in month) {
        y[month[i] - 1] += 1
      }
      y = y.map(v => 100 - v * 10)
      let x = Array(y.length).fill(0).map((v, ind) => ind * svgWidth / (y.length-1))
      for (let i in y) {
        this.points += x[i] + ',' + y[i] + ' '
      }
    },
    fetchTodo () {
      this.switcher.todo = 1
      fetch('https://api.github.com/repos/easonapolo/forvera-vue/issues?creator=easonapolo')
      .then(res => {
        return res.json()
      }).then(json => {
        let todos = []
        for (let i in json) {
          let todo = json[i].body.split('\n').map(v => v.split(' '))
          todos.push(todo)
        }
        this.todos = todos
        this.switcher.todo = 0
      })
    },
    fetchCommit () {
      this.switcher.commit = 1
      let d = new Date()
      d.setMonth(d.getMonth()-3)
      fetch(`https://api.github.com/repos/easonapolo/forvera-vue/commits?since=${d.toISOString()}`)
      .then(res => {
        return res.json()
      }).then(json => {
        let commits = []
        for (let i in json) {
          let m = json[i].commit.message
          let [v, ls] = m.split('\n\n')
          ls = ls.split('\n')
          commits.push([v, ls])
          if (i == 4) break
        }
        this.commits = commits
        this.switcher.commit = 0
      })
    }
  },
}
</script>

<style lang="scss">
.tools {
  .tool {
    padding-top: 1.5rem;
    padding-bottom: 1.5rem;
  }
  .back {
    position: absolute;
    left: 0;
    top: 0;
    padding: .5rem 2rem;
    width: calc(100% - 4rem);
    height: 2rem;
    line-height: 2rem;
    text-align: left;
    font-size: .875rem;
    cursor: pointer;
    transition: background-color .2s ease-in-out;
    &:hover {
      background-color: #f6f6fc;
    }
    .back-icon {
      position: absolute;
      left: 1rem;
      top: 1.125rem;
      height: .75rem;
      width: .75rem;
      background-size: contain;
      background-image: url(../../public/left.png);
      transition: transform .2s ease-in-out;
    }
    &:hover .back-icon{
      transform: translateX(-5px);
    }
  }
  .item {
    a {
      text-decoration: underline;
    }
    .head {
      line-height: 2.5rem;
    }
    .li {
      display: flex;
      line-height: 1.5rem;
      font-size: 0.8125rem;
      .v {
        flex: 0 0 auto;
        width: 5rem;
      }
      .l {
        flex: 1 1 auto;
      }
    }
    #chart {
      padding: 0 0;
      svg {
        width: 100%;
        height: 108px;
      }
      .years {
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        color: #888;
        font-style: italic;
        font-size: 13px;
      }
    }
  }

  .right {
    .rbox {
      .activeindex {
        background-color: #eeeef4;
      }
      .item {
        .remove {
          float: right;
          width: 1rem;
          height: 1rem;
          background-image: url(../../public/remove.png);
          background-size: contain;
        }
      }
      a {
        span {
          width: 1.25rem;
          height: 1.25rem;
        }
        div {
          height: 1rem;
          line-height: 1rem;
        }
        span, div {
          display: inline-block;
          margin-right: .5rem;
          background-size: contain;
          vertical-align: middle;
        }
      }
      .github {
        background-color: #eef;
        span {
          background-image: url('../../public/github.png');
        }
      }
      .gmail{
        background-color: #f5f5f5;
        span {
          background-image: url('../../public/gmail.png');
        }
      }
    }
    }
}
</style>