import type { PostMeta } from './api'

const THREE_MONTHS = 3600 * 24 * 30 * 3 * 1000

export type PostGroup = { name: string; posts: PostMeta[] }

export function groupPosts(posts: PostMeta[]): PostGroup[] {
  const now = Date.now()
  const recent: PostMeta[] = []
  const years: Record<string, PostMeta[]> = {}

  posts.forEach(post => {
    const updated = new Date(post.updated_time || 0).getTime()
    if (updated >= now - THREE_MONTHS) {
      recent.push(post)
      return
    }
    const year = `${new Date(post.updated_time || 0).getFullYear()}`
    if (!years[year]) years[year] = []
    years[year].push(post)
  })

  const groups: PostGroup[] = []
  if (recent.length) {
    recent.sort(
      (a, b) => new Date(b.updated_time || 0).getTime() - new Date(a.updated_time || 0).getTime(),
    )
    groups.push({ name: '最近', posts: recent })
  }

  Object.keys(years)
    .sort((a, b) => Number(b) - Number(a))
    .forEach(year => groups.push({ name: year, posts: years[year] }))

  return groups
}
