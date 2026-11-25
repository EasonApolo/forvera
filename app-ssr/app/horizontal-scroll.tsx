'use client'

import { useEffect, useRef } from 'react'

export function HorizontalScroll({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scroller = ref.current
    if (!scroller) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      scroller.scrollLeft += delta
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [])

  const names = className ? `horizontal-scroll ${className}` : 'horizontal-scroll'
  return (
    <div ref={ref} className={names}>
      {children}
    </div>
  )
}
