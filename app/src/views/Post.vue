<template>
  <div>
    <layout>
      <template #main>
        <list>
          <template #list>
            <div class="article item" v-if="post.title" @click='rightToggle=false'>
              <div class="title">{{post.title}}</div>
              <div class="time">{{slicedDate(post.updated_time)}}</div>
              <div class="content" v-html="post.content"></div>
            </div>
          </template>
        </list>
        <Loading :intSwitch=switch1></Loading>
        <div id="comment-header">> 评论 { {{commentsData.length}} }</div>
        <div class="comment-wrapper" v-if="commentsLoadOK">
          <div v-for="(comment, index) in commentsData" :key="comment.id" class="comment">
            <span class="name">{{comment.author_name}}</span>
            <span v-if="comment.parent !== 0" class="replyto">&nbsp;&nbsp;-->&nbsp;&nbsp;{{replyToName(comment.toIndex)}}</span>
            <span class="content">: {{comment.content.rendered.replace(/<[^>]*>/g, '')}}</span>
            <span class="reply" @click="commentToIndex = index">回复</span>
            <span class="time">{{slicedDate(comment.date)}}</span>
          </div>
        </div>
        <Loading :intSwitch=switch2></Loading>
        <ul class="add" @click='rightToggle=false'>
          <li>> 添加评论<span v-show="commentToIndex !== -1" class="addTo">
              对  <i> {{commentToName}} </i> 
              <span id="removeAddTo" @click="commentToIndex = -1">取消</span></span>
          </li>
          <li><textarea name="content" rows="2" placeholder="评论" v-model="addContent"/></li>
          <li><input name="name" placeholder="名字" v-model="addName"></li>
          <li><input type="submit" value="提交" @click="addComment" :class="{disabled:addSending}"></li>
        </ul>
      </template>
      <template #right>
        <rbox title='目录' :class='{mini:!miniRight}' @click='rightToggle=!rightToggle' v-if="titles.length > 0">
          <template #list>
            <div class='item' v-for='(t, i) in titles' :key='i' :class='{second:t[1]!=undefined}' @click='jumpToTitle($event, i)'>
              <span v-if='t[1]==undefined'>{{t[0]}}</span>
              {{t[2]}}
            </div>
          </template>
        </rbox>
      </template>
    </layout>
  </div>
</template>

<script>
import Layout from '@/components/Layout.vue'
import List from '@/components/List.vue'
import Rbox from '@/components/Rbox.vue'
import Loading from '@/components/Loading.vue'
import { request } from '@/shared/Request'
export default {
  name: 'post',
  data () {
    return {
      postId: 0,
      //data
      post: {
      },
      titles: [],
      commentsData: {},
      commentsLoadOK: false,
      navData: [],
      //other setting
      switch1: 0,
      switch2: 0,
      //addComment
      commentToIndex: -1,
      addName: '',
      addContent: '',
      addSending: false,
      // right menu
      rightToggle: false,
      mainNode: undefined
    }
  },
  components: {
    Loading,
    'layout': Layout,
    'rbox': Rbox,
    'list': List,
  },
  computed: {
    replyToName: function () {
      return id => this.commentsData[id].author_name
    },
    commentToName: function () {
      let i = this.commentsData[this.commentToIndex]
      return i ? i.author_name : ''
    },
    slicedDate: function () {
      return function (d) {
        let ds = d.split(/[-T:]/)
        ds[0] = ds[0].slice(2, 4)
        ds = ds.slice(0, -1)
        ds = ds.slice(0,3).join('-') + ' ' + ds.slice(3,5).join(':')
        return ds
      }
    },
    miniRight: function () {
      return document.body.clientWidth > 750 || this.rightToggle
    },
  },
  mounted () {
    this.mainNode = document.getElementsByClassName('main')[0]
  },
  beforeRouteEnter (to, from, next) {
    next(vm => vm.init())
  },
  methods: {
    init () {
      this.postId = this.$route.params._id
      this.getPost()
    },
    async getPost () {
      this.switch1 = 1
      this.post = await request(`post/${ this.postId }`)
      this.switch1 = 0
      setTimeout(this.getTitles, 0)
    },
    addComment () {
      if (this.addSending) return
      if (this.addContent.replace(/\s+/g, '') === '') {
        this.$bus.$emit('pop', '姓名或评论不能为空*A*')
        return
      }
      this.addSending = true
      let form = new FormData()
      let parent = this.commentToIndex == -1 ? 0 : this.commentsData[this.commentToIndex].id
      form.append('author_name', this.addName)
      form.append('content', this.addContent)
      form.append('parent', parent)
      form.append('post', this.postId)
      form.append('author_email', '787817128@qq.com')
      fetch(window.ip + 'comments', {
        method: 'POST',
        body: form
      }).then(() => {
        this.addSending = false
        this.addName = this.addContent = ''
        this.commentToIndex = -1
        this.fetchComment()
      })
      return 0
    },
    getTitles() {
      let reg = />([IVX]+\.)([IVX]+)*(.+?(?=<))/g
      let titles = []
      let res
      while ((res = reg.exec(this.artData.content.rendered)) != null)  {
        titles.push([res[1], res[2], res[3]])
      }
      this.titles = titles
    },
    jumpToTitle (e, t_id) {
      e.stopPropagation()
      let t = this.titles[t_id].join('')
      let p_nodes = document.getElementsByTagName('p')
      for (let i = 0; i < p_nodes.length; i++) {
        if (p_nodes[i].innerText == t) {
          this.mainNode.scrollTop = p_nodes[i].offsetTop
          break
        }
      }
    },
    fetchComment () {
      this.switch2 = 1
      fetch(window.ip + 'comments?order=asc&post=' + this.postId)
      .then(res => {
        return res.json()
      }).then(json => {
        this.commentsData = json
        let l = this.commentsData.length
        for (let i = 0; i < l; i++) {
          let to = this.commentsData[i].parent
          if (to !== 0) {
            for (let j = 0; j < i; j++) {
              if (this.commentsData[j].id === to) {
                this.commentsData[i].toIndex = j
                break
              }
            }
          }
        }
        this.switch2 = 0
        this.commentsLoadOK = true
      })
    },
    reload (index) {
      let id = this.navData[index].id
      if (id === -1) {
        this.$bus.$emit('pop', this.navData[index].title)
        return
      }
      this.$router.push({path: 'art', query: {id: id}})
      this.postId = this.$route.query.id
      this.artData = {}
      this.commentsData = {}
      this.commentsLoadOK = false
      this.navData = []
      //addComment
      this.commentToIndex = -1
      this.addName = ''
      this.addContent = ''
      this.fetchArticle()
      this.fetchComment()
    }
  }
}
</script>

<style lang="scss" scoped>
.art {
  position: relative;
  margin: 0 30%;
  padding-bottom: 2rem;
  border-right: 1px solid #eee;
}
.article {
  padding: 2rem;
  .time {
    padding: .5rem 0;
    color: #888;
    font-size: 0.875rem;
  }
  .content {
    font-size: .9375rem;
    line-height: 1rem;
    ::v-deep {
      p {
        margin: 1.25rem 0;
        line-height: 1.625rem;
        text-align: left;
        word-wrap: break-word;
      }
      a {
        text-decoration: underline;
      }
      img {
        max-width: 100%;
        height: auto;
        margin-bottom: .75rem;
      }
      figcaption {
        text-align: center;
        color: #888;
        font-size: 14px;
        font-style: italic;
      }
      code {
        display: block;
        margin: .5rem 0;
        padding: .75rem 1.25rem;
        line-height: 1.25rem;
        text-align: left;
        background-color: #FaFaFF;
        word-wrap: break-word;
        font-family: "Courier New";
        border-radius: .5rem;
      }
      pre {
        white-space: pre-wrap;
      }
    }
  }
}
#comment-header {
  padding: 0 2rem;
  font-size: .9375rem;
  line-height: 1.5rem;
  text-align: left;
}
.comment-wrapper {
  padding: 0 2rem 2rem 2rem;
  text-align: left;
  .comment {
    margin: 0.5rem 0;
    font-size: 0.875rem;
    .name {
      font-size: 0.875rem;
    }
    .time, .reply{
      opacity: 0;
      color: #AAA;
      transition: .3s ease;
      margin-left: .5rem;
    }
    .reply {
      margin-left: 1rem;
      cursor: pointer;
    }
    &:hover .time {
      opacity: 1;
    }
    &:hover .reply {
      opacity: 1;
      margin-left: .5rem;
    }
  }
}
.add {
  margin: 0 2rem;
  text-align: left;
  font-size: 0.9375rem;
  li {
    margin-bottom: 1rem;
    span {
      margin-right: 1rem;
    }
    &:last-child {
      margin-bottom: 0;
    }
  }
  #removeAddTo {
    cursor: pointer;
    color: #888;
  }
  li:first-child span:first-child {
    margin-left: 1rem;
  }
  li:last-child span{
    display: inline-block;
    height: 2rem;
  }
  input, textarea {
    line-height: 1.5rem;
    padding: .25rem .625rem;
    border: 1px #ddd solid;
    transition: .2s ease;
    outline: none;
    color: #2c3e50;
    resize: none;
    width: 8rem;
    font-family: Arial, Helvetica, sans-serif;
  }
  input[type=submit] {
    width: 4rem;
  }
  .disabled {
    color: #AAA;
  }
  textarea {
    width: 20rem;
  }
  input:focus {
    border: 1px #4FB9F1 solid;
  }
  textarea:focus {
    border: 1px #4FB9F1 solid;
  }
}
@media (max-width: 750px) {
  .art {
    margin: 0;
    padding: 0 0 6rem 0;
    border-right: none;
  }
  .comment .time {
    display: none;
  }
  .art .add li textarea {
    width: calc(100% - 22px);
  }
  .art .article .content img {
    max-width: 100%;
    height: auto;
  }
  .right {
  }
}
</style>