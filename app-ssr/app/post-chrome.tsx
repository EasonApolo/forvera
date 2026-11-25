'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { TocItem } from '@/lib/content'

function withDepth(items: TocItem[]) {
  const stack: { level: number; depth: number }[] = []
  return items.map(item => {
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) stack.pop()
    const depth = stack.length === 0
      ? 0
      : stack[stack.length - 1].depth + (item.level - stack[stack.length - 1].level)
    stack.push({ level: item.level, depth })
    return { ...item, depth }
  })
}

export function PostChrome({ toc, postId }: { toc: TocItem[]; postId: string }) {
  const items = useMemo(() => withDepth(toc), [toc])
  const [expanded, setExpanded] = useState(false)
  const [activeId, setActiveId] = useState(toc[0]?.id || '')
  const headings = useRef<HTMLElement[]>([])

  useEffect(() => {
    setExpanded(false)
    setActiveId(toc[0]?.id || '')
    const container = document.querySelector('.post-page .content')
    headings.current = container
      ? (Array.from(container.querySelectorAll('.h1, .h2, .h3, .h4')) as HTMLElement[])
      : []

    let ticking = false
    const sync = () => {
      const list = headings.current
      if (!list.length) return
      const threshold = 120
      let currentId = list[0].id
      for (const heading of list) {
        if (heading.getBoundingClientRect().top <= threshold) currentId = heading.id
        else break
      }
      setActiveId(current => (current === currentId ? current : currentId))
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        sync()
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    sync()
    return () => window.removeEventListener('scroll', onScroll)
  }, [postId, toc])

  useEffect(() => {
    if (!activeId) return
    document.querySelectorAll(`.toc-item[data-toc-id="${activeId}"]`).forEach(node => {
      const el = node as HTMLElement
      const list = el.closest('.toc-list') as HTMLElement | null
      if (!list) return
      const itemTop = el.offsetTop
      const itemBottom = itemTop + el.offsetHeight
      const viewTop = list.scrollTop
      const viewBottom = viewTop + list.clientHeight
      if (itemTop < viewTop + 8) list.scrollTo({ top: Math.max(0, itemTop - 8), behavior: 'smooth' })
      else if (itemBottom > viewBottom - 8) list.scrollTo({ top: itemBottom - list.clientHeight + 8, behavior: 'smooth' })
    })
  }, [activeId])

  const scrollToHeading = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return
    setActiveId(id)
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onBack = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.history.length > 1) {
      event.preventDefault()
      window.history.back()
    }
  }

  const renderItems = (suffix: string) =>
    items.map(item => (
      <div
        key={`${item.id}${suffix}`}
        className={activeId === item.id ? 'toc-item active' : 'toc-item'}
        data-toc-id={item.id}
        style={{ paddingLeft: `${item.depth * 1.25}rem` }}
        onClick={() => scrollToHeading(item.id)}
      >
        {item.title}
      </div>
    ))

  return (
    <>
      {items.length > 0 ? (
        <div className="toc toc-desktop">
          <div className="toc-title">目录</div>
          <div className="toc-list">{renderItems('')}</div>
        </div>
      ) : null}
      {items.length > 0 && expanded ? (
        <div className="toc toc-mobile">
          <div className="toc-header">
            <div className="toc-title">目录</div>
          </div>
          <div className="toc-list">{renderItems('-m')}</div>
        </div>
      ) : null}
      <nav className="nav">
        <a className="nav-item" href="/" onClick={onBack}>‹ 返回</a>
        {items.length > 0 ? (
          <a
            className={expanded ? 'nav-item active' : 'nav-item'}
            href="#!"
            onClick={event => {
              event.preventDefault()
              setExpanded(open => !open)
            }}
          >
            目录
          </a>
        ) : null}
      </nav>
    </>
  )
}
