import { parse } from './markdown'

function toResourcePath(url: string) {
  let path = url
  if (url.includes('://')) {
    try {
      path = new URL(url).pathname || url
    } catch {
      path = url
    }
  }
  path = path.replace(/\/+/g, '/')
  if (!path.startsWith('/')) path = `/${path}`
  return path.startsWith('/resource') ? path : `/resource${path}`
}

function toThumb(resourcePath: string) {
  if (resourcePath.includes('_thumb')) return resourcePath
  const queryIndex = resourcePath.indexOf('?')
  const base = queryIndex === -1 ? resourcePath : resourcePath.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : resourcePath.slice(queryIndex)
  const dot = base.lastIndexOf('.')
  const thumb = dot === -1 ? `${base}_thumb` : `${base.slice(0, dot)}_thumb${base.slice(dot)}`
  return `${thumb}${query}`
}

export type TocItem = { id: string; title: string; level: number }

function textFromHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

/** 与 Vue 文章页同一顺序：先改图片地址，再走 markdown 解析。图片用站点相对路径。 */
export function renderPostHtml(content: string): { html: string; toc: TocItem[] } {
  const rewritten = (content || '').replace(
    /<img src="(https?:\/\/[^/]+)?(\/[^"]+)"/g,
    (_match, _origin, path) => {
      const resource = toResourcePath(path || '')
      const original = resource.replace('_thumb', '')
      return `<img src="${toThumb(resource)}" data-original="${original}"`
    },
  )
  const toc: TocItem[] = []
  const html = parse(rewritten).replace(
    /<div class="h([1-4])">([\s\S]*?)<\/div>/g,
    (_match, level: string, inner: string) => {
      const id = `post-toc-${toc.length}`
      const title = textFromHtml(inner) || `标题 ${toc.length + 1}`
      toc.push({ id, title, level: Number(level) })
      return `<div class="h${level}" id="${id}">${inner}</div>`
    },
  )
  return { html, toc }
}

export function authorName(author: PostAuthor) {
  if (author && typeof author === 'object') return author.username || ''
  return ''
}

type PostAuthor = { username?: string } | string | null | undefined

export function formatDate(iso?: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function categoryTitles(ids: string[] | undefined, categories: { _id: string; title: string }[]) {
  return (ids || [])
    .map(id => categories.find(category => category._id === id)?.title)
    .filter((title): title is string => !!title)
}
