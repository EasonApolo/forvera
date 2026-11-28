'use client'

import { useEffect, useRef, useState } from 'react'

type View = {
  url: string
  thumbUrl: string
  width: number
  height: number
}

function pathOnly(url: string) {
  if (!url) return ''
  if (url.includes('://')) {
    try {
      const parsed = new URL(url)
      return `${parsed.pathname}${parsed.search}`
    } catch {
      return url
    }
  }
  return url
}

function toOriginal(url: string) {
  return pathOnly(url).replace(/_thumb(?=\.[^./?#]+)/, '')
}

function toThumb(url: string) {
  const original = toOriginal(url)
  const queryIndex = original.indexOf('?')
  const base = queryIndex === -1 ? original : original.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : original.slice(queryIndex)
  const dot = base.lastIndexOf('.')
  const thumb = dot === -1 ? `${base}_thumb` : `${base.slice(0, dot)}_thumb${base.slice(dot)}`
  return `${thumb}${query}`
}

function parseSize(url: string) {
  const match = pathOnly(url).match(/_(\d+)_(\d+)(?:_thumb)?\.[^./?]+(?:\?.*)?$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { width, height }
}

export function PostImageViewer({ postId }: { postId: string }) {
  const [view, setView] = useState<View | null>(null)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  const loaded = useRef<Record<string, boolean>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const originalRef = useRef<HTMLImageElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { clientX: number; clientY: number }>())
  const pinch = useRef({
    distance: 0,
    scale: 1,
    x: 0,
    y: 0,
    midX: 0,
    midY: 0,
  })
  const dragOrigin = useRef({ x: 0, y: 0 })
  const live = useRef({ scale: 1, x: 0, y: 0 })

  useEffect(() => {
    live.current = { scale, x: translate.x, y: translate.y }
  }, [scale, translate])

  const resetTransform = () => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    setRotation(0)
    live.current = { scale: 1, x: 0, y: 0 }
  }

  const onDoubleClick = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (live.current.scale > 1) {
      setScale(1)
      setTranslate({ x: 0, y: 0 })
      live.current = { ...live.current, scale: 1, x: 0, y: 0 }
      return
    }
    setScale(2)
    setTranslate({ x: 0, y: 0 })
    live.current = { ...live.current, scale: 2, x: 0, y: 0 }
  }

  const close = () => {
    pointers.current.clear()
    setDragging(false)
    resetTransform()
    setFrame({ width: 0, height: 0 })
    setView(null)
  }

  const updateLayout = () => {
    const stage = stageRef.current
    const image = originalRef.current
    if (!stage || !view) return
    const sourceWidth = image?.naturalWidth || view.width
    const sourceHeight = image?.naturalHeight || view.height
    if (!sourceWidth || !sourceHeight) return
    const fit = Math.min(stage.clientWidth / sourceWidth, stage.clientHeight / sourceHeight, 1)
    setFrame({
      width: Math.round(sourceWidth * fit),
      height: Math.round(sourceHeight * fit),
    })
  }

  useEffect(() => {
    const container = document.querySelector('.post-page .content')
    if (!container) return
    const images = Array.from(container.querySelectorAll('img'))
    const onClick = (event: Event) => {
      const image = event.currentTarget as HTMLImageElement
      event.preventDefault()
      event.stopPropagation()
      const original = toOriginal(image.getAttribute('data-original') || image.getAttribute('src') || image.src)
      if (!original) return
      if (image.getAttribute('src') !== original) image.setAttribute('src', original)
      const size = parseSize(original)
      pointers.current.clear()
      setDragging(false)
      resetTransform()
      setFrame({ width: 0, height: 0 })
      setView({
        url: original,
        thumbUrl: loaded.current[original] ? '' : toThumb(original),
        width: size?.width || 0,
        height: size?.height || 0,
      })
    }
    images.forEach(image => image.addEventListener('click', onClick))
    return () => images.forEach(image => image.removeEventListener('click', onClick))
  }, [postId])

  useEffect(() => {
    if (!view) return
    const htmlOverflow = document.documentElement.style.overflow
    const bodyOverflow = document.body.style.overflow
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', updateLayout)
    const frameId = requestAnimationFrame(updateLayout)
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updateLayout)
      document.documentElement.style.overflow = htmlOverflow
      document.body.style.overflow = bodyOverflow
    }
  }, [view])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const next = Math.min(4, Math.max(1, live.current.scale + (event.deltaY > 0 ? -0.1 : 0.1)))
      const scaleValue = Number(next.toFixed(2))
      live.current.scale = scaleValue
      if (scaleValue === 1) {
        live.current.x = 0
        live.current.y = 0
        setTranslate({ x: 0, y: 0 })
      }
      setScale(scaleValue)
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [view])

  const stagePoint = (clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: clientX, y: clientY }
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointers.current.size >= 2) {
      const rect = stageRef.current?.getBoundingClientRect()
      const points = Array.from(pointers.current.values()).slice(0, 2)
      if (!rect) return
      pinch.current = {
        distance: Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY),
        scale: live.current.scale,
        x: live.current.x,
        y: live.current.y,
        midX: (points[0].clientX + points[1].clientX) / 2 - rect.left - rect.width / 2,
        midY: (points[0].clientY + points[1].clientY) / 2 - rect.top - rect.height / 2,
      }
      setDragging(true)
      return
    }
    if (live.current.scale <= 1) {
      setDragging(false)
      return
    }
    setDragging(true)
    dragOrigin.current = {
      x: event.clientX - live.current.x,
      y: event.clientY - live.current.y,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY })
    if (pointers.current.size >= 2) {
      const points = Array.from(pointers.current.values()).slice(0, 2)
      if (pinch.current.distance <= 0) return
      const distance = Math.hypot(points[0].clientX - points[1].clientX, points[0].clientY - points[1].clientY)
      const next = Math.min(4, Math.max(1, pinch.current.scale * (distance / pinch.current.distance)))
      const scaleValue = Number(next.toFixed(2))
      if (scaleValue === 1) {
        live.current = { scale: 1, x: 0, y: 0 }
        setScale(1)
        setTranslate({ x: 0, y: 0 })
        return
      }
      const mid = stagePoint((points[0].clientX + points[1].clientX) / 2, (points[0].clientY + points[1].clientY) / 2)
      const ratio = scaleValue / pinch.current.scale
      const x = Number((mid.x - (pinch.current.midX - pinch.current.x) * ratio).toFixed(2))
      const y = Number((mid.y - (pinch.current.midY - pinch.current.y) * ratio).toFixed(2))
      live.current = { scale: scaleValue, x, y }
      setScale(scaleValue)
      setTranslate({ x, y })
      return
    }
    if (!dragging || live.current.scale <= 1) return
    const x = event.clientX - dragOrigin.current.x
    const y = event.clientY - dragOrigin.current.y
    live.current = { ...live.current, x, y }
    setTranslate({ x, y })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 1 && live.current.scale > 1) {
      const point = Array.from(pointers.current.values())[0]
      setDragging(true)
      dragOrigin.current = { x: point.clientX - live.current.x, y: point.clientY - live.current.y }
      return
    }
    setDragging(false)
  }

  if (!view) return null

  const frameWidth = frame.width
  const frameHeight = frame.height
  const transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale}) rotate(${rotation}deg)`

  return (
    <div
      ref={rootRef}
      className="image-viewer"
      onClick={close}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="viewer-bg" />
      <button type="button" className="viewer-circle viewer-close" aria-label="close" onClick={event => { event.stopPropagation(); close() }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.5 6.5l11 11m0-11l-11 11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      <div className="viewer-tools" onClick={event => event.stopPropagation()}>
        <button
          type="button"
          className="viewer-circle"
          aria-label="rotate-right"
          onClick={() => setRotation(value => value + 90)}
        >
          <svg viewBox="0 0 1024 1024" aria-hidden="true">
            <path d="M482.773333 66.517333l148.181334 151.168a21.333333 21.333333 0 0 1 0 29.866667l-147.84 150.826667a21.333333 21.333333 0 0 1-28.16 2.090666l-2.346667-2.090666-27.050667-27.605334a21.333333 21.333333 0 0 1 0-29.866666l69.888-71.338667a304.64 304.64 0 1 0 318.421334 352.682667l1.024-6.826667c0.170667-1.408 0.426667-3.285333 0.64-5.632a21.333333 21.333333 0 0 1 22.314666-19.114667l42.666667 2.261334a21.333333 21.333333 0 0 1 20.224 22.4l-0.085333 1.024-1.194667 10.496A389.973333 389.973333 0 1 1 484.821333 184.746667l-59.306666-60.458667a21.333333 21.333333 0 0 1 0-29.866667l27.093333-27.605333a21.333333 21.333333 0 0 1 30.165333-0.298667z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <div className="viewer-stage" ref={stageRef}>
        <div
          className="viewer-frame"
          style={{ transform, width: frameWidth, height: frameHeight }}
          onClick={event => event.stopPropagation()}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
        >
          {view.thumbUrl ? (
            <img className="viewer-thumb" src={view.thumbUrl} alt="" draggable={false} style={{ width: frameWidth, height: frameHeight }} />
          ) : null}
          <img
            ref={originalRef}
            className="viewer-original"
            src={view.url}
            alt=""
            draggable={false}
            style={{
              width: frameWidth,
              height: frameHeight,
              cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
            }}
            onLoad={() => {
              loaded.current[view.url] = true
              setView(current => current && current.url === view.url ? { ...current, thumbUrl: '' } : current)
              updateLayout()
            }}
          />
        </div>
      </div>
    </div>
  )
}
