<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Btn from './Btn.vue'

type LocationPoint = {
  lat: number
  lng: number
  count?: number
  source?: 'track' | 'home'
  happenedAt?: string
}

const props = defineProps<{
  show: boolean
  points: LocationPoint[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'set-home', payload: { lat: number; lng: number }): void
}>()

const globeRef = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const loadError = ref('')
const ZOOM_LEVELS = [0.003, 0.01, 0.3, 1, 3] as const
const INITIAL_ZOOM_LEVEL = 0.01
const ZOOM_EPSILON = 1e-8
let globe: any = null
let rafId = 0
let selectedDotEl: HTMLElement | null = null
let lastClusterCellKm = -1
const pendingSetHome = ref(false)
const selectedPoint = ref<{
  lat: number
  lng: number
  count: number
  label: string
} | null>(null)

const getTileUrl = (x: number, y: number, level: number) => {
  const zoom = Math.max(0, Math.min(19, Math.round(level)))
  return `https://basemaps.cartocdn.com/light_all/${zoom}/${x}/${y}.png`
}

const toRad = (deg: number) => (deg * Math.PI) / 180

const distanceKm = (a: LocationPoint, b: LocationPoint) => {
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
  return R * c
}

const mergeVeryClose = (points: LocationPoint[]) => {
  const merged: Array<LocationPoint & { count: number }> = []
  for (const point of points) {
    const pCount = Math.max(1, point.count || 1)
    let mergedFlag = false
    for (const target of merged) {
      if (distanceKm(point, target) < 1) {
        const total = target.count + pCount
        target.lat = (target.lat * target.count + point.lat * pCount) / total
        target.lng = (target.lng * target.count + point.lng * pCount) / total
        target.count = total
        mergedFlag = true
        break
      }
    }
    if (!mergedFlag) {
      merged.push({ ...point, count: pCount })
    }
  }
  return merged
}

const clusterByKm = (points: Array<LocationPoint & { count: number }>, cellKm: number) => {
  if (!cellKm) return points
  const avgLat = points.length
    ? points.reduce((sum, p) => sum + p.lat, 0) / points.length
    : 0
  const latStep = cellKm / 111
  const lngStep = cellKm / (111 * Math.max(0.2, Math.cos(toRad(avgLat))))
  const buckets = new Map<string, LocationPoint & { count: number; homeCount: number }>()

  for (const p of points) {
    const key = `${Math.round(p.lat / latStep)}:${Math.round(p.lng / lngStep)}`
    const existing = buckets.get(key)
    if (!existing) {
      buckets.set(key, {
        ...p,
        count: p.count,
        homeCount: p.source === 'home' ? p.count : 0,
      })
      continue
    }
    const total = existing.count + p.count
    existing.lat = (existing.lat * existing.count + p.lat * p.count) / total
    existing.lng = (existing.lng * existing.count + p.lng * p.count) / total
    existing.count = total
    existing.homeCount += p.source === 'home' ? p.count : 0
    if (existing.homeCount > existing.count / 2) {
      existing.source = 'home'
    }
  }

  return Array.from(buckets.values())
}

const getClusterCellKm = () => {
  if (!globe) return 0
  const pov = globe.pointOfView()
  const altitude = pov?.altitude ?? 1.5
  if (altitude > 2.2) return 350
  if (altitude > 1.5) return 120
  if (altitude > 1.0) return 35
  if (altitude > 0.7) return 12
  return 0
}

const buildData = () => {
  const base = mergeVeryClose(props.points || [])
  const clustered = clusterByKm(base, getClusterCellKm())
  return clustered.map((p, idx) => ({
    id: idx,
    lat: p.lat,
    lng: p.lng,
    count: p.count || 1,
    sizePx: p.source === 'home' ? 8 : Math.min(9, 4 + Math.log2((p.count || 1) + 1)),
    color:
      p.source === 'home'
        ? '#ff7043'
        : `rgba(76, 175, 80, ${Math.min(1, 0.3 + Math.log2((p.count || 1) + 1) * 0.18)})`,
    label:
      p.source === 'home'
        ? `家 (${p.count || 1})`
        : `轨迹点 (${p.count || 1})`,
  }))
}

const getInitialView = () => {
  const points = props.points || []
  const home = [...points].reverse().find(p => p.source === 'home')
  if (home) {
    return { lat: home.lat, lng: home.lng, altitude: INITIAL_ZOOM_LEVEL }
  }

  const latest = points[points.length - 1]
  if (latest) {
    return { lat: latest.lat, lng: latest.lng, altitude: INITIAL_ZOOM_LEVEL }
  }

  return { lat: 20, lng: 0, altitude: INITIAL_ZOOM_LEVEL }
}

const centerToInitialView = (ms = 0) => {
  if (!globe) return
  globe.pointOfView(getInitialView(), ms)
}

const destroyGlobe = () => {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  if (globe && typeof globe._destructor === 'function') {
    globe._destructor()
  }
  globe = null
}

const mountGlobe = async () => {
  if (!props.show || !globeRef.value || globe) return
  loading.value = true
  loadError.value = ''
  try {
    const { default: Globe } = await import('globe.gl')
    globe = Globe()(globeRef.value)
      .globeTileEngineUrl((x: number, y: number, l: number) => getTileUrl(x, y, l))
      .backgroundColor('rgba(0,0,0,0)')
      .htmlLat((d: any) => d.lat)
      .htmlLng((d: any) => d.lng)
      .htmlElement((d: any) => {
        const el = document.createElement('div')
        el.className = 'track-dot'
        el.style.width = `${d.sizePx}px`
        el.style.height = `${d.sizePx}px`
        el.style.background = d.color
        el.style.boxShadow = `0 0 0.35rem ${d.color}`
        el.title = d.label
        el.addEventListener('click', (event) => {
          event.stopPropagation()
          pendingSetHome.value = false
          selectedPoint.value = {
            lat: d.lat,
            lng: d.lng,
            count: d.count,
            label: d.label,
          }
          if (selectedDotEl && selectedDotEl !== el) {
            selectedDotEl.classList.remove('selected')
          }
          el.classList.add('selected')
          selectedDotEl = el
          globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: INITIAL_ZOOM_LEVEL }, 700)
        })
        return el
      })

    centerToInitialView(0)
    globe.controls().autoRotate = false
    globe.controls().enablePan = false
    globe.controls().addEventListener('change', () => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        refreshGlobe()
      })
    })
    refreshGlobe(true)
  } catch (error) {
    console.error('Failed to load globe:', error)
    loadError.value = '地球加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const refreshGlobe = (force = false) => {
  if (!globe) return
  const cellKm = getClusterCellKm()
  if (!force && cellKm === lastClusterCellKm) {
    return
  }
  lastClusterCellKm = cellKm
  globe.htmlElementsData(buildData())
  selectedDotEl = null
}

const getNextZoomLevel = (currentAltitude: number, direction: 'in' | 'out') => {
  if (direction === 'in') {
    let candidate: number | null = null
    for (const level of ZOOM_LEVELS) {
      if (level < currentAltitude - ZOOM_EPSILON) {
        candidate = level
      }
    }
    return candidate
  }

  for (const level of ZOOM_LEVELS) {
    if (level > currentAltitude + ZOOM_EPSILON) {
      return level
    }
  }
  return null
}

const zoomGlobe = (direction: 'in' | 'out') => {
  if (!globe) return
  const pov = globe.pointOfView()
  const altitude = pov?.altitude ?? 1
  const nextAltitude = getNextZoomLevel(altitude, direction)
  if (nextAltitude === null) return
  globe.pointOfView({ ...pov, altitude: nextAltitude }, 260)
}

const zoomIn = () => {
  zoomGlobe('in')
}

const zoomOut = () => {
  zoomGlobe('out')
}

const requestSetHomeConfirm = () => {
  if (!selectedPoint.value) return
  pendingSetHome.value = true
}

const confirmSetHome = () => {
  if (!selectedPoint.value || !pendingSetHome.value) return
  emit('set-home', {
    lat: selectedPoint.value.lat,
    lng: selectedPoint.value.lng,
  })
  pendingSetHome.value = false
}

const formatCoord = (value: number) => value.toFixed(6)

watch(
  () => props.show,
  async (val) => {
    if (val) {
      await nextTick()
      await mountGlobe()
      refreshGlobe(true)
      centerToInitialView(0)
    } else {
      selectedPoint.value = null
      pendingSetHome.value = false
      selectedDotEl = null
      lastClusterCellKm = -1
      destroyGlobe()
    }
  },
  { immediate: true },
)

watch(
  () => props.points,
  () => {
    refreshGlobe(true)
  },
  { deep: true },
)

onBeforeUnmount(() => {
  destroyGlobe()
})
</script>

<template>
  <div v-if="show" class="overlay" @click.self="emit('close')">
    <div class="panel">
      <div class="header">
        <div>旅行地球</div>
        <button class="close" @click="emit('close')">关闭</button>
      </div>
      <div ref="globeRef" class="globe"></div>
      <div v-if="!loading && !loadError" class="zoom-controls">
        <button class="zoom-btn" @click="zoomIn" aria-label="放大地球">+</button>
        <button class="zoom-btn" @click="zoomOut" aria-label="缩小地球">-</button>
      </div>
      <div v-if="loading" class="tip">地球加载中...</div>
      <div v-if="loadError" class="tip error">{{ loadError }}</div>
      <div v-if="selectedPoint" class="point-info">
        <div class="point-main">
          <div class="coords">
            <div class="point-line">纬度：{{ formatCoord(selectedPoint.lat) }}</div>
            <div class="point-line">经度：{{ formatCoord(selectedPoint.lng) }}</div>
          </div>
          <div class="point-count">
            <div class="count-label">次数</div>
            <div class="count-value">{{ selectedPoint.count }}</div>
          </div>
        </div>
        <div class="point-actions">
          <Btn size="small" @click="requestSetHomeConfirm">设为家</Btn>
          <Btn v-if="pendingSetHome" type="primary" size="small" @click="confirmSetHome">确定</Btn>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel {
  width: min(92vw, 760px);
  height: min(82vh, 640px);
  background: var(--card-bg);
  border-radius: 10px;
  overflow: clip;
  position: relative;
}

.header {
  height: 2.25rem;
  padding: 0 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}

.close {
  border: 1px solid var(--border-light);
  background: transparent;
  border-radius: 4px;
  font-size: 12px;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  color: inherit;
}

.globe {
  width: 100%;
  height: calc(100% - 2.25rem);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.globe :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}

.globe :deep(.track-dot) {
  border-radius: 999px;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.globe :deep(.track-dot.selected) {
  outline: 2px solid #fff;
  outline-offset: 1px;
}

.tip {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 13px;
  color: var(--text-secondary);
}

.error {
  color: #b42318;
}

.point-info {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  min-width: 12.5rem;
  background: rgba(var(--card-bg-rgb), 0.92);
  color: var(--text);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 0.5rem 0.55rem;
  font-size: 12px;
  z-index: 2;
  backdrop-filter: blur(6px);
}

.zoom-controls {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  display: flex;
  gap: 0.45rem;
  z-index: 2;
}

.zoom-btn {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: rgba(var(--card-bg-rgb), 0.9);
  color: var(--text);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.zoom-btn:active {
  transform: translateY(1px) scale(0.98);
}

.point-main {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.65rem;
}

.coords {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  align-items: flex-start;
}

.point-line {
  line-height: 1.35;
  text-align: left;
}

.point-count {
  min-width: 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 0.12rem;
}

.count-label {
  color: var(--text-secondary);
  font-size: 11px;
}

.count-value {
  font-size: 14px;
  font-weight: 700;
}

.point-actions {
  margin-top: 0.4rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
}

:global(:root.dark) .point-info,
:global(:root.dark) .zoom-btn {
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}
</style>
