import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCategories, getPost, siteOrigin } from '@/lib/api'
import { authorName, categoryTitles, formatDate, renderPostHtml } from '@/lib/content'
import { PostChrome } from '../../post-chrome'

type Props = { params: Promise<{ postId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { postId } = await params
  const post = await getPost(postId)
  if (!post?._id) return { title: '文章不存在' }
  return {
    title: `${post.title || '无标题'} - Eason's Life~`,
    description: post.description || post.title || '',
    alternates: { canonical: `${siteOrigin}/post/${postId}` },
  }
}

export default async function PostPage({ params }: Props) {
  const { postId } = await params
  const [post, categories] = await Promise.all([getPost(postId), getCategories()])
  if (!post?._id) notFound()
  const { html, toc } = renderPostHtml(post.content || '')
  const names = categoryTitles(post.category, Array.isArray(categories) ? categories : [])
  const created = formatDate(post.created_time)
  const updated = formatDate(post.updated_time)

  return (
    <main className="layout-list">
      <div className="post-page">
        <div className="grey-text align-left">by {authorName(post.author)}</div>
        <div className="card">
          <div className="meta">
            <div className="left">
              <h1 className="title">{post.title}</h1>
              <div className="categories">{names.join(' / ')}</div>
            </div>
            <div className="right">
              {post.created_time !== post.updated_time ? (
                <div className="time">{'=> '}{updated}</div>
              ) : null}
              <div className="time">{created}</div>
            </div>
          </div>
        </div>
        <div className="card main">
          {post.description ? <div className="description">{post.description}</div> : null}
          <div className="content" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="ending">—— 完 ——</div>
        <PostChrome toc={toc} postId={postId} />
      </div>
    </main>
  )
}
