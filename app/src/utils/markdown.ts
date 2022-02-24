export const parse = (text: string) => {
  let arr = text.split('\n')
  arr = makeLevel(arr)
  return arr.join('')
}

const makeParagraph = (str: string) => {
  return `<p>${str}</p>`
}

const makeLevel = (arr: Array<string>) => {
  return arr.map(str => {
    let res = makeTitle(str) || makeList(str)
    if (res) str = res
    else str = makeParagraph(str)
    return str
  })
}

const makeTitle = (str: string) => {
  let matched = str.match(/^#+\s/)
  if (matched?.length) {
    return `<div class="h${matched[0].length - 1}">${str.slice(matched[0].length)}</div>`
  }
  return false
}

const makeList = (str: string) => {
  let matched = str.match(/^\s*-\s/)
  if (matched?.length) {
    return `<div class="ul${matched[0].length - 1}">${str.slice(matched[0].length)}</div>`
  }
  return false
}