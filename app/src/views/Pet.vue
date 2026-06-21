<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import io from 'socket.io-client'
import BottomNavBar from '../components/layout/BottomNavBar.vue'
import HorizontalScroll from '../components/layout/HorizontalScroll.vue'
import Card from '../components/Card.vue'
import Btn from '../components/Btn.vue'
import EditableInput from '../components/EditableInput.vue'
import TravelGlobe from '../components/TravelGlobe.vue'
import Popover from '../components/Popover.vue'
import { ip } from '../config'

type TodoKind =
  | 'eat-oreo'
  | 'eat-cheese-beef-burger'
  | 'eat-luosifen'
  | 'eat-sichuan-hotpot'
  | 'eat-bbq'
  | 'eat-salad'
  | 'eat-baozi'
  | 'drink-water'
  | 'drink-hot-water'
  | 'drink-cold-water'
  | 'drink-coffee'
  | 'drink-tea'
  | 'drink-red-date-goji-tea'
  | 'drink-ice-coconut-water'
  | 'drink-hot-soymilk'
  | 'drink-ice-cream'
  | 'sleep'
  | 'watch-short-video'
  | 'play-genshin'
  | 'slow-jog'
  | 'work-code'
  | 'work-live'

type ActionTimePeriod =
  | 'morning'
  | 'forenoon'
  | 'noon'
  | 'afternoon'
  | 'dusk'
  | 'evening'
  | 'late-night'

type ActionCategory = {
  key: string
  title: string
  options: Array<{
    kind: TodoKind
    title: string
    totalMinutes: number
    mode?: 'finite' | 'ongoing'
    effects: string
    availablePeriods?: ActionTimePeriod[]
    settleEveryMinutes?: number
    minDurationMinutes?: number
    skill?: {
      level: number
      exp: number
      maxExp: number
      progress: number
      marks: number[]
    }
  }>
}

type PetState = {
  petId: string
  stats: {
    name: string
    hunger: number
    hungerMax: number
    thirst: number
    thirstMax: number
    happiness: number
    happinessMax: number
    energy: number
    energyMax: number
    health: number
    healthMax: number
    warmth: number
    money: number
    calories: number
    weightKg: number
  }
  injuries: Array<{
    key: string
    label: string
    source: string
    damagePerMinute: number
  }>
  travel: {
    type: 'none' | 'short' | 'medium' | 'long'
    distanceKm: number
    effects: {
      hungerDelta: number
      thirstDelta: number
      energyDelta: number
      happinessDelta: number
    }
  }
  weather: {
    text: string
    temperatureC: number | null
    effects: {
      hungerDelta: number
      thirstDelta: number
      warmthDelta: number
    }
  }
  statusEffects: {
    hunger: Array<{ source: string; deltaPerMinute: number }>
    thirst: Array<{ source: string; deltaPerMinute: number }>
    happiness: Array<{ source: string; deltaPerMinute: number }>
    energy: Array<{ source: string; deltaPerMinute: number }>
    health: Array<{ source: string; deltaPerMinute: number }>
    warmth: Array<{ source: string; deltaPerMinute: number }>
    money: Array<{ source: string; deltaPerMinute: number }>
  }
  locations: Array<{
    lat: number
    lng: number
    count?: number
    source?: 'track' | 'home'
    happenedAt?: string
  }>
  things: Array<{
    itemId: string
    name: string
    description: string
    price: number
    sellRate: number
    equippable: boolean
    equipped: boolean
    durability: number
    durabilityDailyDecay: number
    count: number
  }>
  shopCatalog: Array<{
    itemId: string
    name: string
    description: string
    price: number
    sellRate: number
    equippable: boolean
    initialDurability: number
    durabilityDailyDecay: number
  }>
  currentTodo: {
    _id: string
    title: string
    kind: TodoKind
    mode?: 'finite' | 'ongoing'
    elapsedMinutes: number
    totalMinutes: number
    source: 'auto' | 'manual'
    settleEveryMinutes?: number
    hungerDelta?: number
    thirstDelta?: number
    happinessDelta?: number
    energyDelta?: number
    healthDelta?: number
    warmthDelta?: number
    moneyDelta?: number
    hasSkill?: boolean
    skillExp?: number
  } | null
  records: Array<{
    _id: string
    type: 'start' | 'progress' | 'complete' | 'interrupt' | 'system'
    message: string
    reason?: string
    happenedAt: string
  }>
  actionCatalog: ActionCategory[]
}

const router = useRouter()
const petId = 'default-pet'
const socketRef = ref<any>(null)

const loading = ref(true)
const restarting = ref(false)
const showActionPanel = ref(false)
const showThingPanel = ref(false)
const showStatusPanel = ref(true)
const showGlobe = ref(false)
const activeCategory = ref('eat')
const thingTab = ref<'things' | 'buy'>('things')
const selectedThing = ref<{
  itemId: string
  name: string
  description: string
  price: number
  sellRate?: number
  equippable: boolean
  equipped?: boolean
  durability?: number
  durabilityDailyDecay?: number
  ownedCount?: number
} | null>(null)
const selectedThingSource = ref<'things' | 'buy'>('things')
let locationTimer: ReturnType<typeof setInterval> | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
const nowTick = ref(Date.now())

const state = ref<PetState>({
  petId,
  stats: {
    name: '阿福',
    hunger: 0,
    hungerMax: 120,
    thirst: 0,
    thirstMax: 120,
    happiness: 0,
    happinessMax: 100,
    energy: 0,
    energyMax: 100,
    health: 100,
    healthMax: 100,
    warmth: 0,
    money: 0,
    calories: 0,
    weightKg: 50,
  },
  injuries: [],
  travel: {
    type: 'none',
    distanceKm: 0,
    effects: { hungerDelta: 0, thirstDelta: 0, energyDelta: 0, happinessDelta: 0 },
  },
  weather: {
    text: '未知',
    temperatureC: null,
    effects: { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 },
  },
  statusEffects: {
    hunger: [],
    thirst: [],
    happiness: [],
    energy: [],
    health: [],
    warmth: [],
    money: [],
  },
  locations: [],
  things: [],
  shopCatalog: [],
  currentTodo: null,
  records: [],
  actionCatalog: [],
})

const navItems = computed(() => [
  { key: 'back', label: '‹ 返回' },
  { key: 'action', label: '事情', active: showActionPanel.value },
  { key: 'thing', label: '物品', active: showThingPanel.value },
  { key: 'status', label: '状态', active: showStatusPanel.value },
])

const activeActions = computed(() => {
  const category = state.value.actionCatalog.find(c => c.key === activeCategory.value)
  return category?.options || []
})

const displayRecords = computed(() => {
  return [...state.value.records].reverse()
})

const isSystemRecord = (record: PetState['records'][number]) => {
  return record.type === 'system'
}

const canBuySelectedThing = computed(() => {
  if (selectedThingSource.value !== 'buy' || !selectedThing.value) return false
  if (selectedThing.value.equippable && (selectedThing.value.ownedCount || 0) > 0) return false
  return state.value.stats.money >= selectedThing.value.price
})

const inventoryThings = computed(() => {
  return [...state.value.things].sort((a, b) => {
    if (a.equipped && !b.equipped) return -1
    if (!a.equipped && b.equipped) return 1
    return 0
  })
})

const currentProgressText = computed(() => {
  const current = state.value.currentTodo
  if (!current) return '空闲中'
  if (current.mode === 'ongoing' || current.totalMinutes <= 0) {
    return `${current.title} (已进行 ${current.elapsedMinutes} 分钟)`
  }
  return `${current.title} (${current.elapsedMinutes}/${current.totalMinutes} 分钟)`
})

const periodLabelMap: Record<ActionTimePeriod, string> = {
  morning: '早晨',
  forenoon: '上午',
  noon: '中午',
  afternoon: '下午',
  dusk: '傍晚',
  evening: '晚上',
  'late-night': '深夜',
}

const getLevelByExp = (exp: number) => {
  if (exp >= 1000) return 3
  if (exp >= 300) return 2
  return 1
}

const moneyGainByLevel = (kind: TodoKind, level: number) => {
  if (kind === 'work-code') {
    return level === 1 ? 3 : level === 2 ? 4 : 6
  }
  if (kind === 'work-live') {
    return level === 1 ? 1 : level === 2 ? 1.5 : 3
  }
  return 0
}

const getActionDurationText = (option: ActionCategory['options'][number]) => {
  if (option.mode === 'ongoing' || option.totalMinutes <= 0) {
    const minDurationText = option.minDurationMinutes && option.minDurationMinutes > 0
      ? `最短${option.minDurationMinutes}分钟`
      : '不限时长'
    const settleText = `每${Math.max(1, option.settleEveryMinutes || 1)}分钟结算`
    return `${minDurationText}，${settleText}`
  }
  return `${option.totalMinutes}分钟`
}

const getActionAvailablePeriodsText = (option: ActionCategory['options'][number]) => {
  if (option.kind === 'sleep') return '中午、晚上、深夜'
  if (!option.availablePeriods?.length) return ''
  return option.availablePeriods.map(period => periodLabelMap[period]).join('、')
}

const getWorkIncomeText = (kind: TodoKind, level: number) => {
  return `${formatNumber(moneyGainByLevel(kind, level))}元/分钟`
}

const getActionSummary = (option: ActionCategory['options'][number]) => {
  if (option.skill) {
    return `${option.effects} ${getWorkIncomeText(option.kind, option.skill.level)}`
  }
  return option.effects
}

const getActionPopoverContent = (option: ActionCategory['options'][number]) => {
  const lines = [
    `时长：${getActionDurationText(option)}`,
    `效果：${option.effects}`,
  ]

  const availablePeriodsText = getActionAvailablePeriodsText(option)
  if (availablePeriodsText) {
    lines.unshift(`可用时间：${availablePeriodsText}`)
  }

  if (option.skill) {
    lines.push(`当前等级：Lv${option.skill.level}`)
    lines.push(`当前经验：${option.skill.exp}/${option.skill.maxExp}`)
    lines.push(`等级收益：${getWorkIncomeText(option.kind, 1)} / ${getWorkIncomeText(option.kind, 2)} / ${getWorkIncomeText(option.kind, 3)}`)
  }

  return lines.join('\n')
}

const formatNumber = (val: number) => {
  if (!Number.isFinite(val)) return '0'
  const rounded = Math.round(val * 100) / 100
  return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

const formatWeight = (val: number) => {
  if (!Number.isFinite(val)) return '50'
  const rounded = Math.round(val * 1000) / 1000
  return rounded.toFixed(3).replace(/\.000$/, '').replace(/(\.\d\d)0$/, '$1')
}

const formatPerMinuteEffects = (
  list: Array<{ source: string; deltaPerMinute: number }> | undefined,
) => {
  if (!list?.length) {
    return '无持续影响'
  }
  return list
    .map(item => `${item.source} ${item.deltaPerMinute > 0 ? '+' : ''}${formatNumber(item.deltaPerMinute)}/分钟`)
    .join('；')
}

const formatPerMinuteEffectsMultiline = (
  list: Array<{ source: string; deltaPerMinute: number }> | undefined,
) => {
  if (!list?.length) {
    return '无持续影响'
  }
  return list
    .map(item => `${item.source} ${item.deltaPerMinute > 0 ? '+' : ''}${formatNumber(item.deltaPerMinute)}/分钟`)
    .join('\n')
}

const formatPerMinuteTotalEffect = (
  list: Array<{ source: string; deltaPerMinute: number }> | undefined,
) => {
  if (!list?.length) return '无变化'
  const total = list.reduce((sum, item) => sum + item.deltaPerMinute, 0)
  if (total === 0) return '±0/分钟'
  return `${total > 0 ? '+' : ''}${formatNumber(total)}/分钟`
}



const currentGainText = computed(() => {
  const current = state.value.currentTodo
  if (!current || current.mode !== 'ongoing') {
    return '已获得：暂无'
  }

  const settleEvery = Math.max(1, current.settleEveryMinutes || 1)
  const settledTimes = Math.floor((current.elapsedMinutes || 0) / settleEvery)
  if (settledTimes <= 0) {
    return '已获得：暂无'
  }

  const parts: string[] = []
  const hungerGain = (current.hungerDelta || 0) * settledTimes
  const thirstGain = (current.thirstDelta || 0) * settledTimes
  const happinessGain = (current.happinessDelta || 0) * settledTimes
  const energyGain = (current.energyDelta || 0) * settledTimes
  const healthGain = (current.healthDelta || 0) * settledTimes
  const warmthGain = (current.warmthDelta || 0) * settledTimes

  if (hungerGain !== 0) parts.push(`${hungerGain > 0 ? '+' : ''}${formatNumber(hungerGain)}饱度`)
  if (thirstGain !== 0) parts.push(`${thirstGain > 0 ? '+' : ''}${formatNumber(thirstGain)}渴度`)
  if (happinessGain !== 0) parts.push(`${happinessGain > 0 ? '+' : ''}${formatNumber(happinessGain)}快乐`)
  if (energyGain !== 0) parts.push(`${energyGain > 0 ? '+' : ''}${formatNumber(energyGain)}精力`)
  if (healthGain !== 0) parts.push(`${healthGain > 0 ? '+' : ''}${formatNumber(healthGain)}健康`)
  if (warmthGain !== 0) parts.push(`${warmthGain > 0 ? '+' : ''}${formatNumber(warmthGain)}冷暖`)

  let moneyGain = (current.moneyDelta || 0) * settledTimes
  if (current.hasSkill && (current.kind === 'work-code' || current.kind === 'work-live')) {
    const currentExp = current.skillExp || 0
    const startExp = Math.max(0, currentExp - settledTimes)
    moneyGain = 0
    for (let i = 0; i < settledTimes; i++) {
      const level = getLevelByExp(startExp + i)
      moneyGain += moneyGainByLevel(current.kind, level)
    }
    parts.push(`+${formatNumber(settledTimes)}经验`)
  }

  if (moneyGain !== 0) {
    parts.push(`${moneyGain > 0 ? '+' : ''}${formatNumber(moneyGain)}元`)
  }

  return parts.length ? `已获得：${parts.join(' ')}` : '已获得：暂无'
})

const applyPetState = (nextState: PetState) => {
  state.value = {
    ...nextState,
    weather: nextState.weather || {
      text: '未知',
      temperatureC: null,
      effects: { hungerDelta: 0, thirstDelta: 0, warmthDelta: 0 },
    },
    statusEffects: nextState.statusEffects || {
      hunger: [],
      thirst: [],
      happiness: [],
      energy: [],
      health: [],
      warmth: [],
      money: [],
    },
    shopCatalog: nextState.shopCatalog || [],
  }
  loading.value = false
  if (!state.value.actionCatalog.some(c => c.key === activeCategory.value)) {
    activeCategory.value = state.value.actionCatalog[0]?.key || 'eat'
  }
}

const connectSocket = () => {
  const wsUrl = ip.replace('http://', 'ws://').replace('https://', 'wss://')
  const socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket'],
    timeout: 5000,
  })

  socket.on('connect', () => {
    socket.emit('joinPet', { petId })
  })

  socket.on('petState', (nextState: PetState) => {
    applyPetState(nextState)
  })

  socketRef.value = socket
}

const closePanels = () => {
  showActionPanel.value = false
  showThingPanel.value = false
  showStatusPanel.value = false
  selectedThing.value = null
}

const handleSelectNav = (key: string) => {
  if (key === 'back') {
    router.push({ name: 'playground' })
    return
  }

  if (key === 'action') {
    const next = !showActionPanel.value
    closePanels()
    showActionPanel.value = next
    return
  }

  if (key === 'thing') {
    const next = !showThingPanel.value
    closePanels()
    showThingPanel.value = next
    return
  }

  if (key === 'status') {
    const next = !showStatusPanel.value
    closePanels()
    showStatusPanel.value = next
  }
}

const triggerTodo = (kind: TodoKind) => {
  socketRef.value?.emit('triggerPetTodo', { petId, kind })
  showActionPanel.value = false
}

const openThingDetailFromInventory = (thing: PetState['things'][number]) => {
  selectedThingSource.value = 'things'
  selectedThing.value = {
    itemId: thing.itemId,
    name: thing.name,
    description: thing.description,
    price: thing.price,
    sellRate: thing.sellRate,
    equippable: thing.equippable,
    equipped: thing.equipped,
    durability: thing.durability,
    durabilityDailyDecay: thing.durabilityDailyDecay,
    ownedCount: thing.count,
  }
}

const openThingDetailFromShop = (thing: PetState['shopCatalog'][number]) => {
  selectedThingSource.value = 'buy'
  const owned = state.value.things.find(entry => entry.itemId === thing.itemId)
  selectedThing.value = {
    itemId: thing.itemId,
    name: thing.name,
    description: thing.description,
    price: thing.price,
    sellRate: thing.sellRate,
    equippable: thing.equippable,
    equipped: owned?.equipped || false,
    durability: owned?.durability || thing.initialDurability || 0,
    durabilityDailyDecay: owned?.durabilityDailyDecay || thing.durabilityDailyDecay || 0,
    ownedCount: owned?.count || 0,
  }
}

const getOwnedThing = (itemId: string) => {
  return state.value.things.find(entry => entry.itemId === itemId)
}

const getSellPriceLabel = (thing: { price: number; sellRate?: number } | null) => {
  if (!thing) return '0'
  return formatNumber(Math.max(0, (thing.price || 0) * Math.max(0, thing.sellRate || 0)))
}

const purchaseSelectedThing = () => {
  if (!selectedThing.value || selectedThingSource.value !== 'buy') return
  socketRef.value?.emit(
    'purchasePetThing',
    {
      petId,
      itemId: selectedThing.value.itemId,
    },
    (snapshot?: PetState) => {
      if (snapshot) {
        applyPetState(snapshot)
      }
      thingTab.value = 'things'
      selectedThing.value = null
    }
  )
}

const equipSelectedThing = () => {
  if (!selectedThing.value || selectedThingSource.value !== 'things') return
  socketRef.value?.emit(
    'equipPetThing',
    {
      petId,
      itemId: selectedThing.value.itemId,
    },
    (snapshot?: PetState) => {
      if (snapshot) {
        applyPetState(snapshot)
      }
      selectedThing.value = null
    }
  )
}

const unequipSelectedThing = () => {
  if (!selectedThing.value || selectedThingSource.value !== 'things') return
  socketRef.value?.emit(
    'unequipPetThing',
    {
      petId,
      itemId: selectedThing.value.itemId,
    },
    (snapshot?: PetState) => {
      if (snapshot) {
        applyPetState(snapshot)
      }
      selectedThing.value = null
    }
  )
}

const sellSelectedThing = () => {
  if (!selectedThing.value || selectedThingSource.value !== 'things') return
  socketRef.value?.emit(
    'sellPetThing',
    {
      petId,
      itemId: selectedThing.value.itemId,
    },
    (snapshot?: PetState) => {
      if (snapshot) {
        applyPetState(snapshot)
      }
      selectedThing.value = null
    }
  )
}

const useSelectedThing = () => {
  if (!selectedThing.value || selectedThingSource.value !== 'things') return
  socketRef.value?.emit(
    'usePetThing',
    {
      petId,
      itemId: selectedThing.value.itemId,
    },
    (snapshot?: PetState) => {
      if (snapshot) {
        applyPetState(snapshot)
      }
      selectedThing.value = null
    }
  )
}

const restartPet = () => {
  const socket = socketRef.value
  if (!socket || restarting.value) {
    return
  }

  restarting.value = true
  socket.emit('restartPet', { petId }, (snapshot?: PetState) => {
    if (snapshot) {
      applyPetState(snapshot)
    }
    restarting.value = false
  })

  setTimeout(() => {
    if (restarting.value) {
      socket.emit('queryPetState', { petId })
      restarting.value = false
    }
  }, 1200)
}

const submitPetName = (name: string) => {
  const socket = socketRef.value
  if (!socket) return
  socket.emit('updatePetName', { petId, name }, (snapshot?: PetState) => {
    if (snapshot) {
      applyPetState(snapshot)
    }
  })
}

const uploadLocation = () => {
  const socket = socketRef.value
  if (!socket || !navigator.geolocation) return
  if (!window.isSecureContext) {
    console.warn('[Pet] Geolocation requires secure context (HTTPS) outside localhost.')
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      socket.emit('updatePetLocation', {
        petId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      })
    },
    err => {
      const reasonMap: Record<number, string> = {
        1: 'permission denied',
        2: 'position unavailable',
        3: 'timeout',
      }
      console.warn('[Pet] Geolocation failed:', reasonMap[err.code] || err.message || 'unknown')
    },
    { enableHighAccuracy: false, timeout: 6000 }
  )
}

const openGlobe = () => {
  showGlobe.value = true
}

const setAsHomeAt = (payload: { lat: number; lng: number }) => {
  const socket = socketRef.value
  if (!socket) return
  socket.emit('setPetHome', {
    petId,
    lat: payload.lat,
    lng: payload.lng,
  })
}

const travelTypeText = computed(() => {
  switch (state.value.travel.type) {
    case 'short':
      return '短途旅行'
    case 'medium':
      return '中途旅行'
    case 'long':
      return '长途旅行'
    default:
      return '无旅行状态'
  }
})

const healthInjuryLabel = computed(() => {
  if (!state.value.injuries.length) return ''
  const topInjury = [...state.value.injuries].sort(
    (a, b) => (b.damagePerMinute || 0) - (a.damagePerMinute || 0)
  )[0]
  return topInjury?.label || ''
})

type TimePeriodSegment = {
  label: string
  startMinute: number
  endMinute: number
}

const TIME_PERIOD_SEGMENTS: TimePeriodSegment[] = [
  { label: '深夜', startMinute: 0, endMinute: 6 * 60 },
  { label: '早晨', startMinute: 6 * 60, endMinute: 9 * 60 },
  { label: '上午', startMinute: 9 * 60, endMinute: 11 * 60 + 30 },
  { label: '中午', startMinute: 11 * 60 + 30, endMinute: 13 * 60 + 30 },
  { label: '下午', startMinute: 13 * 60 + 30, endMinute: 17 * 60 },
  { label: '傍晚', startMinute: 17 * 60, endMinute: 19 * 60 },
  { label: '晚上', startMinute: 19 * 60, endMinute: 24 * 60 },
]

const timePeriodView = computed(() => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowTick.value))

  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find(p => p.type === 'minute')?.value || '0')
  const totalMinutes = hour * 60 + minute
  const currentSegmentIndex = TIME_PERIOD_SEGMENTS.findIndex(segment =>
    totalMinutes >= segment.startMinute && totalMinutes < segment.endMinute,
  )
  const safeIndex = currentSegmentIndex >= 0 ? currentSegmentIndex : 0
  const segments = TIME_PERIOD_SEGMENTS.map((segment, index) => ({
    ...segment,
    isActive: index === safeIndex,
    startPercent: (segment.startMinute / (24 * 60)) * 100,
    widthPercent: ((segment.endMinute - segment.startMinute) / (24 * 60)) * 100,
  }))

  const elapsedPercent = (totalMinutes / (24 * 60)) * 100

  return {
    segments,
    elapsedPercent,
  }
})

const formatTime = (dateLike: string) => {
  const date = new Date(dateLike)
  const hh = `${date.getHours()}`.padStart(2, '0')
  const mm = `${date.getMinutes()}`.padStart(2, '0')
  return `${hh}:${mm}`
}

const formatFullTime = (dateLike: string) => {
  const date = new Date(dateLike)
  const yyyy = `${date.getFullYear()}`
  const mm = `${date.getMonth() + 1}`.padStart(2, '0')
  const dd = `${date.getDate()}`.padStart(2, '0')
  const hh = `${date.getHours()}`.padStart(2, '0')
  const min = `${date.getMinutes()}`.padStart(2, '0')
  const ss = `${date.getSeconds()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
}

onMounted(() => {
  connectSocket()
  uploadLocation()
  nowTick.value = Date.now()
  clockTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 30 * 1000)
  locationTimer = setInterval(() => {
    uploadLocation()
  }, 60 * 1000)
})

onUnmounted(() => {
  const socket = socketRef.value
  if (socket) {
    socket.disconnect()
  }
  if (locationTimer) {
    clearInterval(locationTimer)
    locationTimer = null
  }
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
})
</script>

<template>
  <div class="pet-page" @click="closePanels">
    <div class="content" @click.stop>
      <Card class="current-card">
        <div class="pet-name">
          <EditableInput
            v-model="state.stats.name"
            :max-length="20"
            :inline="true"
            placeholder="输入名字"
            @submit="submitPetName"
          />
          <Btn size="small" :loading="restarting" @click="restartPet">重启</Btn>
        </div>
        <div class="pet-status">当前：{{ currentProgressText }}</div>
        <div class="pet-gain">{{ currentGainText }}</div>
      </Card>

      <div v-if="loading" class="empty">连接中...</div>
      <div v-else-if="!state.records.length" class="empty">暂无日志</div>

      <Card v-else class="log-card">
        <div class="log-list">
          <div
            class="log-item"
            :class="{ system: isSystemRecord(record) }"
            v-for="record in displayRecords"
            :key="record._id"
          >
            <div class="time" :title="formatFullTime(record.happenedAt)">
              {{ formatTime(record.happenedAt) }}
            </div>
            <div class="msg">
              <span>{{ record.message }}</span>
              <Popover v-if="record.reason" :content="record.reason" />
            </div>
          </div>
        </div>
      </Card>
    </div>

    <div v-if="showActionPanel" class="panel" @click.stop>
      <div class="actions">
        <div
          class="action"
          v-for="option in activeActions"
          :key="option.kind"
          @click="triggerTodo(option.kind)"
        >
          <div class="action-main">
            <div class="action-left">
              <div class="name-row">
                <div class="name">
                  {{ option.title }}
                  <span v-if="option.kind === 'sleep'" class="sleep-badge">😴</span>
                </div>
                <Popover :content="getActionPopoverContent(option)" />
              </div>
              <div class="skill" v-if="option.skill">
                <div class="skill-row">
                  <div class="skill-bar">
                    <div class="skill-marks">
                      <span
                        class="skill-mark"
                        v-for="(mark, idx) in option.skill.marks"
                        :key="`${option.kind}-${idx}`"
                        :style="{ left: `${mark}%` }"
                      ></span>
                    </div>
                    <div class="skill-progress" :style="{ width: `${option.skill.progress}%` }"></div>
                  </div>
                  <div class="skill-exp">{{ option.skill.exp }}/{{ option.skill.maxExp }}</div>
                </div>
              </div>
            </div>
            <div class="effect">{{ getActionSummary(option) }}</div>
          </div>
        </div>
      </div>
      <HorizontalScroll class="category-row">
        <div
          class="category"
          :class="{ active: activeCategory === category.key }"
          v-for="category in state.actionCatalog"
          :key="category.key"
          @click="activeCategory = category.key"
        >
          {{ category.title }}
        </div>
      </HorizontalScroll>
    </div>

    <div v-if="showThingPanel" class="panel" @click.stop>
      <div v-if="thingTab === 'things'">
        <div v-if="!state.things.length" class="empty">暂无物品</div>
        <div v-else class="item-grid">
          <div
            class="item-cell"
            :class="{ equipped: thing.equipped }"
            v-for="thing in inventoryThings"
            :key="thing.itemId"
            @click="openThingDetailFromInventory(thing)"
          >
            <div class="item-count-badge" v-if="thing.itemId === 'revive-potion' && thing.count > 0">
              x{{ thing.count }}
            </div>
            <div class="name">{{ thing.name }}</div>
          </div>
        </div>
      </div>

      <div v-else>
        <div class="item-grid">
          <div
            class="item-cell"
            v-for="thing in state.shopCatalog"
            :key="thing.itemId"
            @click="openThingDetailFromShop(thing)"
          >
            <div class="name">{{ thing.name }}</div>
            <div class="count">{{ thing.price }}元</div>
            <div class="cant-buy" v-if="state.stats.money < thing.price">余额不足</div>
          </div>
        </div>
      </div>

      <div v-if="selectedThing" class="thing-detail-mask" @click="selectedThing = null">
        <div class="thing-detail" @click.stop>
          <div class="thing-detail-title">{{ selectedThing.name }}</div>
          <div class="thing-detail-desc">{{ selectedThing.description || '暂无介绍' }}</div>
          <div class="thing-detail-price" v-if="selectedThingSource === 'buy'">{{ selectedThing.price }}元</div>
          <div class="thing-detail-owned" v-if="(selectedThing.ownedCount || 0) > 1">持有：{{ selectedThing.ownedCount }}</div>
          <div class="thing-detail-owned" v-if="selectedThingSource === 'things' && selectedThing.equippable">耐久：{{ formatNumber(selectedThing.durability || 0) }}</div>

          <div class="thing-detail-actions">
            <Btn
              v-if="selectedThingSource === 'buy'"
              small
              :disabled="!canBuySelectedThing"
              @click="purchaseSelectedThing"
            >购买</Btn>

            <Btn
              v-if="selectedThingSource === 'things' && selectedThing.itemId === 'revive-potion' && (selectedThing.ownedCount || 0) > 0"
              small
              @click="useSelectedThing"
            >使用</Btn>

            <Btn
              v-if="selectedThingSource === 'things' && selectedThing.equippable && !selectedThing.equipped"
              small
              @click="equipSelectedThing"
            >装备</Btn>

            <Btn
              v-if="selectedThingSource === 'things' && selectedThing.equippable && selectedThing.equipped"
              small
              @click="unequipSelectedThing"
            >卸下</Btn>

            <Btn
              v-if="selectedThingSource === 'things' && (selectedThing.ownedCount || 0) > 0"
              small
              @click="sellSelectedThing"
            >出售（{{ getSellPriceLabel(selectedThing) }}元）</Btn>
          </div>
        </div>
      </div>

      <div class="thing-tabs">
        <button class="thing-tab" :class="{ active: thingTab === 'things' }" @click="thingTab = 'things'">物品</button>
        <button class="thing-tab" :class="{ active: thingTab === 'buy' }" @click="thingTab = 'buy'">购买</button>
      </div>
    </div>

    <div v-if="showStatusPanel" class="panel" @click.stop>
      <div class="panel-title">状态</div>
      <div class="status-row">
        <span>名称</span><span>{{ state.stats.name }}</span>
      </div>
      <div class="status-row">
        <span>天气</span>
        <span>
          {{ state.weather.text }}
          {{ state.weather.temperatureC === null ? '' : `${formatNumber(state.weather.temperatureC)}°C` }}
        </span>
      </div>
      <div class="status-row">
        <span>时间</span>
        <div class="time-track">
          <div class="time-track-bar" aria-label="北京时间分段进度条">
            <div class="time-track-progress" :style="{ width: `${timePeriodView.elapsedPercent}%` }"></div>
            <div
              v-for="segment in timePeriodView.segments"
              :key="segment.label"
              class="time-track-segment"
              :class="{ active: segment.isActive }"
              :style="{ flexBasis: `${segment.widthPercent}%` }"
            >
            </div>
          </div>
        </div>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>饱度</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.hunger) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.hunger)" />
        </div>
        <span>{{ formatNumber(state.stats.hunger) }}/100</span>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>渴度</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.thirst) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.thirst)" />
        </div>
        <span>{{ formatNumber(state.stats.thirst) }}/100</span>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>快乐</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.happiness) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.happiness)" />
        </div>
        <span>{{ formatNumber(state.stats.happiness) }}/{{ formatNumber(state.stats.happinessMax) }}</span>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>精力</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.energy) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.energy)" />
        </div>
        <span>{{ formatNumber(state.stats.energy) }}/{{ formatNumber(state.stats.energyMax) }}</span>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>健康</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.health) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.health)" />
          <span v-if="healthInjuryLabel" class="injury-badge danger">{{ healthInjuryLabel }}</span>
        </div>
        <span class="health-value-wrap">
          <span>{{ formatNumber(state.stats.health) }}/{{ formatNumber(state.stats.healthMax) }}</span>
        </span>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>冷暖</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.warmth) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.warmth)" />
        </div>
        <span>{{ formatNumber(state.stats.warmth) }}</span>
      </div>
      <div class="travel-block">
        <div class="status-row travel-row">
          <div class="status-main">
            <span>旅行</span>
            <Btn size="small" @click="openGlobe">地球</Btn>
          </div>
          <span class="travel-inline">{{ travelTypeText }}（{{ formatNumber(state.travel.distanceKm) }}km）</span>
        </div>
        <div class="travel-effect" v-if="state.travel.type !== 'none'">
          每分钟额外：{{ state.travel.effects.hungerDelta }}饱度 {{ state.travel.effects.thirstDelta }}渴度 {{ state.travel.effects.energyDelta }}精力 +{{ state.travel.effects.happinessDelta }}快乐
        </div>
      </div>
      <div class="status-row">
        <div class="status-main">
          <span>金钱</span>
          <span class="effect-inline">{{ formatPerMinuteTotalEffect(state.statusEffects.money) }}</span>
          <Popover :content="formatPerMinuteEffectsMultiline(state.statusEffects.money)" />
        </div>
        <span>{{ formatNumber(state.stats.money) }}</span>
      </div>
      <div class="status-row">
        <span>卡路里</span>
        <span>{{ formatNumber(state.stats.calories) }}</span>
      </div>
      <div class="status-row">
        <span>体重</span>
        <span>{{ formatWeight(state.stats.weightKg) }}kg</span>
      </div>
    </div>

    <div @click.stop>
      <BottomNavBar :items="navItems" @select="handleSelectNav" />
    </div>
    <TravelGlobe
      :show="showGlobe"
      :points="state.locations"
      @close="showGlobe = false"
      @set-home="setAsHomeAt"
    />
  </div>
</template>

<style scoped lang="less">
.pet-page {
  min-height: 100vh;
  position: relative;
  padding-bottom: 8rem;
}

.content {
  margin: 0 auto;
  padding: 0.75rem 0.75rem 9rem;
}

.current-card {
  margin-top: 0.5rem;

  .pet-name {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;

    :deep(.button) {
      font-weight: 400;
    }
  }

  .pet-status {
    margin-top: 0.25rem;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .pet-gain {
    margin-top: 0.2rem;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.35;
  }
}

.log-list {
  display: flex;
  flex-direction: column;
}

.log-card {
  margin-top: 0.75rem;
}

.log-item {
  display: grid;
  grid-template-columns: 3rem 1fr;
  gap: 0.5rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  .time {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .msg {
    font-size: 13px;
    word-break: break-word;
    line-height: 1.4;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  &.system {
    .time,
    .msg {
      color: var(--text-secondary);
    }
  }
}

.empty {
  margin-top: 0.75rem;
  color: var(--text-secondary);
  font-size: 13px;
}

.panel {
  position: fixed;
  left: 0.75rem;
  right: 0.75rem;
  margin: 0 auto;
  bottom: 5.5rem;
  max-width: calc(750px);
  max-height: 52vh;
  overflow-y: auto;
  z-index: 10;
  background: var(--card-bg);
  border-radius: 0.75rem;
  box-shadow: 0 6px 18px var(--nav-shadow);
  padding: 0.75rem;

  .panel-content {
    .panel-title {
      font-weight: 700;
      margin-bottom: 0.5rem;
      font-size: 14px;
    }
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.action {
  border: 1px solid var(--border-light);
  border-radius: 0.5rem;
  padding: 0.42rem 0.5rem;
  cursor: pointer;

  .action-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .action-left {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 0 0 auto;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
  }

  .name {
    font-weight: 700;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    flex-shrink: 1;

    .sleep-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 1.2rem;
      height: 1.2rem;
      padding: 0 0.25rem;
      border-radius: 999px;
      background: #0f2a68;
      color: #dbe8ff;
      font-size: 11px;
      line-height: normal;
      transform: translateY(0.5px);
    }
  }

  .effect {
    color: var(--text-secondary);
    font-size: 12px;
    text-align: right;
    line-height: 1.35;
    flex-shrink: 1;
  }

  .skill {
    margin-top: 0.22rem;

    .skill-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .skill-bar {
      width: 100px;
      height: 6px;
      border-radius: 999px;
      background: var(--border-light);
      overflow: hidden;
      position: relative;
    }

    .skill-marks {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .skill-mark {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(255, 255, 255, 0.75);
      transform: translateX(-0.5px);
    }

    .skill-progress {
      height: 100%;
      background: var(--accent-color);
      position: relative;
      z-index: 1;
    }

    .skill-exp {
      font-size: 11px;
      color: var(--text-secondary);
      line-height: 1;
    }
  }
}

.category-row {
  margin-top: 0.625rem;
  gap: 0.5rem;

  .category {
    padding: 0.25rem 0.6rem;
    border-radius: 1rem;
    background: var(--btn-bg);
    color: var(--text-secondary);
    white-space: nowrap;
    font-size: 12px;
    cursor: pointer;
  }

  .active {
    background: var(--accent-color);
    color: #fff;
  }
}

.item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 0.5rem;
}

.thing-tabs {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.6rem;
}

.thing-tab {
  border: 1px solid var(--border-light);
  border-radius: 999px;
  padding: 0.22rem 0.6rem;
  font-size: 12px;
  background: var(--btn-bg);
  color: var(--text-secondary);
  cursor: pointer;

  &.active {
    background: var(--accent-color);
    color: #fff;
  }
}

.item-cell {
  border: 1px solid var(--border-light);
  border-radius: 0.5rem;
  min-height: 64px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  &.equipped {
    border-color: var(--accent-color);
  }

  .name {
    font-size: 12px;
  }

  .count {
    margin-top: 0.2rem;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .cant-buy {
    margin-top: 0.2rem;
    font-size: 11px;
    color: #a55;
  }

  .item-count-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 1rem;
    height: 1rem;
    padding: 0 0.25rem;
    border-radius: 999px;
    background: #b42318;
    color: #fff;
    font-size: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: normal;
    transform: translateY(0.5px);
  }

}

.thing-detail-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.thing-detail {
  width: min(86vw, 20rem);
  background: var(--card-bg);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  text-align: left;

  .thing-detail-title {
    font-size: 14px;
    font-weight: 700;
  }

  .thing-detail-desc,
  .thing-detail-price,
  .thing-detail-owned {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.35;
  }

  .thing-detail-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.4rem;
  }
}

.status-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid var(--border-light);
  font-size: 13px;
}

.time-track {
  width: 120px;
  flex: 0 0 120px;
  display: flex;
  align-items: center;
}

.time-track-bar {
  display: flex;
  position: relative;
  width: 100%;
  border: 1px solid var(--border-light);
  background: var(--border-light);
  border-radius: 999px;
  overflow: hidden;
  height: 6px;
}

.time-track-progress {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent-color);
  z-index: 1;
}

.time-track-segment {
  min-width: 0;
  position: relative;
  height: 100%;
  z-index: 2;

  &:not(:last-child) {
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.5);
  }
}

.status-main {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  flex: 1;
}

.health-value-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.injury-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 1.2rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  font-size: 11px;
  line-height: normal;
  transform: translateY(0.5px);

  &.danger {
    background: #b42318;
    color: #fff;
  }
}

.effect-inline {
  display: inline-block;
  min-width: 0;
  max-width: min(44vw, 15rem);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
}



.travel-block {
  padding: 0.45rem 0;
  border-bottom: 1px solid var(--border-light);

  .travel-row {
    border-bottom: none;
    padding: 0;
  }

  .travel-effect {
    margin: 0.25rem 0 0.4rem;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .travel-inline {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
}
</style>
