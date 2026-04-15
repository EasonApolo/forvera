<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

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
let globe: any = null
let rafId = 0
let selectedDotEl: HTMLElement | null = null
const selectedPoint = ref<{
  lat: number
  lng: number
  count: number
  label: string
} | null>(null)

const getTileUrl = (x: number, y: number, level: number) => {
  const zoom = Math.max(0, Math.min(19, level))
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
    return { lat: home.lat, lng: home.lng, altitude: 0.95 }
  }

  const latest = points[points.length - 1]
  if (latest) {
    return { lat: latest.lat, lng: latest.lng, altitude: 1.2 }
  }

  return { lat: 20, lng: 0, altitude: 1.8 }
}

const centerToInitialView = (ms = 0) => {
  if (!globe) return
  globe.pointOfView(getInitialView(), ms)
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
          globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: 0.9 }, 700)
        })
        return el
      })
      .htmlElementsData(buildData())

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
  } catch (error) {
    console.error('Failed to load globe:', error)
    loadError.value = '地球加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const refreshGlobe = () => {
  if (globe) {
    globe.htmlElementsData(buildData())
    selectedDotEl = null
  }
}

const confirmSetHome = () => {
  if (!selectedPoint.value) return
  emit('set-home', {
    lat: selectedPoint.value.lat,
    lng: selectedPoint.value.lng,
  })
}

const formatCoord = (value: number) => value.toFixed(6)

watch(
  () => props.show,
  async (val) => {
    if (val) {
      await nextTick()
      await mountGlobe()
      refreshGlobe()
      centerToInitialView(450)
    } else {
      selectedPoint.value = null
      selectedDotEl = null
    }
  },
  { immediate: true },
)

watch(
  () => props.points,
  () => {
    refreshGlobe()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  globe = null
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
      <div v-if="loading" class="tip">地球加载中...</div>
      <div v-if="loadError" class="tip error">{{ loadError }}</div>
      <div v-if="selectedPoint" class="point-info">
        <div class="point-title">已选位置</div>
        <div class="point-line">纬度：{{ formatCoord(selectedPoint.lat) }}</div>
        <div class="point-line">经度：{{ formatCoord(selectedPoint.lng) }}</div>
        <div class="point-line">次数：{{ selectedPoint.count }}</div>
        <button class="set-home" @click="confirmSetHome">设为家</button>
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
  min-width: 11rem;
  background: rgba(20, 24, 35, 0.85);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 0.55rem 0.6rem;
  font-size: 12px;
  z-index: 2;
}

.point-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 0.3rem;
}

.point-line {
  line-height: 1.35;
}

.set-home {
  margin-top: 0.45rem;
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  padding: 0.28rem 0.4rem;
  cursor: pointer;
}
</style>
