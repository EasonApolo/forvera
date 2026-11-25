import { PostChrome } from './post-chrome'

export default function NotFound() {
  return (
    <main className="layout-list">
      <p className="empty">文章不存在</p>
      <PostChrome toc={[]} postId="missing" />
    </main>
  )
}
