type ParseContext = {
  source: string
  text: string
  finished: boolean
  index: number
  res: string[]
}

export const parse = (text: string) => {
  let context: ParseContext = new Proxy({ source: text, text, finished: false, index: 0, res: [] }, {
    set: function (src, prop, val, _) {
      // 当index到底的时候自动更新finished
      if (prop === 'index') {
        console.log(val, Reflect.get(src, 'source').length)
        if (val === Reflect.get(src, 'source').length) Reflect.set(src, 'finished', true)
        return Reflect.set(src, 'index', val)
      } else {
        return Reflect.set(src, prop, val)
      }
    }
  })
  let i = 0
  while (!context.finished && i < 10) {
    if (makeList(context)) {}
    else if (makeTitle(context)) {}
    else if (context.text.startsWith('#')) { makeTitle(context) }
    else if (context.text.startsWith('```')) { makeCode(context) }
    else { makeParagraph(context) }
    console.log(context.index, context.finished, context.text, context.res.slice(-1))
    i++
  }
  return context.res.join('')
}

// 提取段落。
// 仅返回内容，不更新context。可供其它生成段落类的方法使用，如生成列表、生成标题、生成普通段落。
const parseParagraph = (context: ParseContext) => {
  let text = context.text

  let end = text.indexOf('\n')
  let found = !!(end >= 0)
  // 如果没有\n则默认到结尾，如果有\n多吃一位把\n吃掉
  end = found ? end : text.length
  const next = found ? end + 1 : end

  const content = text.slice(0, end)
  return { content, next }
}

// 生成普通段落
const makeParagraph = (context: ParseContext) => {
  let text = context.text

  const { content, next} = parseParagraph(context)
  console.log('parseParagraph', content)
  context.res.push(`<p>${content}</p>`)

  context.text = text.slice(next)
  context.index += next
}

// 生成代码块
const makeCode = (context: ParseContext) => {
  let text = context.text
  let i = 3
  let flag = false
  while(i < text.length) {
    if (text[i] === '`' && text.slice(i, i + 3) === '```') {
      flag = true
      break
    }
    i++
  }
  const code = text.slice(3, i)
  console.log('parseParagraph', code)
  context.res.push(`<code>${code}</code>`)
  // 吃掉后面跟的第一个换行
  const next = text.slice(i + 3, i + 4) === '\n' ? i + 4 : i + 3
  context.text = text.slice(next)
  context.index += next
}

// 生成标题
const makeTitle = (context: ParseContext) => {
  let text = context.text
  let matched = text.match(/^#+\s/)
  if (matched?.length) {
    const nextP = matched[0].length
    context.text = text.slice(nextP)
    context.index += nextP
    const { content, next } = parseParagraph(context)
    const titleContent = `<div class="h${matched[0].length - 1}">${content}</div>`
    context.res.push(titleContent)
    context.text = text.slice(nextP + next)
    context.index += next
    return true
  }
  return false
}

// 生成列表
const makeList = (context: ParseContext) => {
  let text = context.text
  let matched = text.match(/^\s*-\s/)
  if (matched?.length) {
    const nextP = matched[0].length
    context.text = text.slice(nextP)
    context.index += nextP
    const { content, next } = parseParagraph(context)
    const listContent = `<div class="ul${matched[0].length - 1}">${content}</div>`
    context.res.push(listContent)
    context.text = text.slice(nextP + next)
    context.index += next
    return true
  }
  return false
}