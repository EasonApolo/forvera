const apiBase = (process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')

export const siteOrigin = (process.env.SITE_ORIGIN || 'https://eason-s.life').replace(/\/+$/, '')

export type PostMeta = {
  _id: string
  title?: string
  description?: string
  category?: string[]
  updated_time?: string
  created_time?: string
  status?: number
}

export type PostDetail = PostMeta & {
  content?: string
  author?: { username?: string } | string | null
}

export type Category = {
  _id: string
  title: string
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${apiBase}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function getPosts() {
  return fetchJson<PostMeta[]>('/api/post')
}

export function getPost(postId: string) {
  return fetchJson<PostDetail>(`/api/post/${encodeURIComponent(postId)}`)
}

export function getCategories() {
  return fetchJson<Category[]>('/api/cat')
}
