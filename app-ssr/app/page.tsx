import type { Metadata } from 'next'
import { getCategories, getPosts, siteOrigin } from '@/lib/api'
import { formatDate } from '@/lib/content'
import { groupPosts } from '@/lib/posts'
import { HorizontalScroll } from './horizontal-scroll'
import { HomeNav } from './site-nav'

export const metadata: Metadata = {
  title: "文字 - Eason's Life~",
  description: 'Eason 的文章列表',
  alternates: { canonical: `${siteOrigin}/` },
}

export default async function PostListPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>
}) {
  const { cat } = await searchParams
  const [posts, categories] = await Promise.all([getPosts(), getCategories()])
  const postList = Array.isArray(posts) ? posts : []
  const categoryList = Array.isArray(categories) ? categories : []
  const active = categoryList.some(item => item._id === cat) ? cat || '' : ''
  const visible = active
    ? postList.filter(post => (post.category || []).includes(active))
    : postList
  const groups = categoryList.length ? groupPosts(visible) : []

  return (
    <main className="layout-list">
      <div className="card categories-wrapper">
        <span>分类</span>
        <HorizontalScroll className="category-scroll">
          {categoryList.map(item => (
            <a
              key={item._id}
              className={active === item._id ? 'button primary' : 'button'}
              href={active === item._id ? '/' : `/?cat=${encodeURIComponent(item._id)}`}
            >
              {item.title}
            </a>
          ))}
        </HorizontalScroll>
      </div>

      {groups.map(group => (
        <div key={group.name} className="post-group">
          <div className="group-name">{group.name}</div>
          {group.posts.map(post => (
            <a key={post._id} className="card post" href={`/post/${post._id}`}>
              <div className="left">{post.title || '无标题'}</div>
              <div className="right">
                <div className="date">{formatDate(post.updated_time)}</div>
                <div className="post-cat">
                  {(post.category || []).map(id => (
                    <div key={id}>{categoryList.find(item => item._id === id)?.title}</div>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
      ))}
      <HomeNav />
    </main>
  )
}
