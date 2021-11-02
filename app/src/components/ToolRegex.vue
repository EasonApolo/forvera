<template>
  <layout>
    <template #main>
      <list>
        <template #list>
          <textarea class='item' id="input" placeholder="input" rows="10" v-model="reg.input"></textarea>
          <textarea class='item' id="reg" placeholder="regular expression" rows="2" v-model="reg.reg"></textarea>
          <div class='item buts'>
            <button id="parse" @click="parse">提取</button>
            <button id="save" @click="save">保存</button>
          </div>
          <textarea class='item' id="output" placeholder="output" rows="10" v-text="reg.output"></textarea>
          <div class='item' v-text="count"></div>
        </template>
      </list>
    </template>
    <template #right>
      <goback></goback>
      <rbox :title='"已保存的正则表达式"'>
        <template #list>
          <div v-for="(reg, index) in reglist" :key="index" :class="{active:listindex===index}" class="item" @click="replace(index)">
            <span>{{reg}}</span>
            <span class="remove" @click.stop="remove(index)"></span>
          </div>
        </template>
      </rbox>
      <rbox :title='"说明"'>
        <template #list>
          <div class="item plain"><b>特点</b><br>给目标词语加上()可以单独提取词语，多个词语自动用tab分隔，可以直接复制进Excel。</div>
          <div class="item" @click='setExample'>
            <b>例子</b>
            <br><i style='color:#aaa;font-size:13px'>{{eg[0]}}</i>
            <br>▸{{eg[1]}}
            <br>◂3500	77.6	1.353
          </div>
          <div class="item flex-item plain">
            <b>常用</b>
            <span class='flex-ele' v-for='(e, i) in el' :key='i' @click='reg.reg+=e[0]'>{{e[0]}}<span v-if='e.length>1'>{{e[1]}}</span></span>
          </div>
        </template>
      </rbox>
    </template>
  </layout>
</template>


<script>
import Goback from './Goback.vue'
import Layout from './Layout.vue'
import List from './List.vue'
import Rbox from './Rbox.vue'

export default {
  name: 'ToolRegex',
  data () {
    return {
      listindex: -1,
      // reg
      reg: {
        input: '',
        reg: '',
        output: '',
        c: 0
      },
      reglist: [],
      eg: ['epoch 3500: acc 77.6%, loss 1.353', '\\s(\\d+).+\\s([\\d\\.]+).+\\s([\\d\\.]+)'],
      el: [['\\s', '空格'], ['\\d', '数字'], ['\\w', '字母'], ['.', '任意字符'], ['+', '一个或以上'], ['*', '零个或以上'], ['[]', '可选'], ['\\n'], ['\\t']]
    }
  },
  components: {
    'goback': Goback,
    'layout': Layout,
    'list': List,
    'rbox': Rbox,
  },
  created () {
    if (localStorage.regex === 'undefined' || localStorage.regex === undefined) {
      localStorage.regex = []
    }
    this.reglist = JSON.parse(localStorage.regex)
  },
  beforeDestroy () {
    this.listindex = -1
  },
  computed: {
    count: function () {
      return this.reg.c + ' 个结果'
    }
  },
  methods: {
    parse: function () {
      this.clearOutput()
      if(this.reg.reg === '') {
        this.$bus.$emit('pop', '你还没有填正则表达式嘞')
        return
      }
      let reg = new RegExp(this.reg.reg, 'g')
      let c = 0
      let result = null
      while ((result = reg.exec(this.reg.input)) != null)  {
          c++
          if (result.length > 1) {
              result = result.splice(1).join('\t');
          }
          this.print(result + "\r\n", c);
      }
      if (c === 0) {
          this.print("", 0);
      }
      this.$bus.$emit('pop', '提取完成')
    },
    clearOutput: function () {
      this.reg.output = ''
    },
    print: function (out, c) {
      this.reg.output = this.reg.output + out
      this.reg.c = c
    },
    replace: function (index) {
      this.reg.reg = this.reglist[index]
      this.listindex = index
    },
    remove: function (index) {
      this.reglist.splice(index, 1)
      this.listindex = -1
    },
    save: function () {
      this.reglist.unshift(this.reg.reg)
      this.$bus.$emit('pop', '已保存在saved regexp中')
    },
    setExample: function () {
      if (this.reg.input == '' && this.reg.reg == '') {
        this.reg.input = this.eg[0]
        this.reg.reg = this.eg[1]
        this.parse()
      }
    }
  },
  watch: {
    'reglist': function () {
      localStorage.regex = JSON.stringify(this.reglist)
    }
  }
}
</script>

<style scoped lang="scss">
textarea, button {
  display: block;
}
textarea {
  padding: .5rem;
  width: 90%;
}
.buts {
  text-align: center;
  button {
    display: inline-block;
    margin: 0 1rem;
    padding: .375rem 1rem;
    background-color: white;
    border: solid 1px #ccf;
    border-radius: 1rem;
    cursor: pointer;
    outline: none;
    transition: 0.2s ease;
    &:hover {
      background-color: #ccf !important;
      color: white;
    }
  }
}
.right {
  .flex-item {
    display: flex;
    flex-flow: wrap;
    span {
      flex: 1 1 auto;
    }
  }
  .plain {
    cursor: inherit !important;
    &:hover {
      background-color: #f6f6fc !important;
    }
  }
  .flex-ele {
    margin: 2px 8px 2px 0;
    padding: 0 4px;
    border-radius: 1rem;
    background-color: #e8e8f0;
    text-align: center;
    font-size: 12px;
    cursor: pointer;
    transition: .2s ease;
    &:hover {
      background-color: #e0e0e4;
    }
    span {
      margin-left: 2px;
    }
  }
}
</style>