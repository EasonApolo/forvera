<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import List from '@/components/layout/List.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import Card from '@/components/Card.vue'
import Btn from '@/components/Btn.vue'
import CircleBtn from '@/components/CircleBtn.vue'
import Input from '@/components/Input.vue'
import StepperFilter from '@/components/StepperFilter.vue'
import { request } from '@/utils/request'

type DietUnit = 'u'
type DietCaloriesUnit = '%' | 'kCal' | 'kJ'

type DietFood = {
  _id: string
  name: string
  unit: DietUnit
  calories_per_unit: number
  calories_multiplier?: number
  last_used_time?: string
  updated_time?: string
}

type DietRecord = {
  _id: string
  food_id?: string | null
  food_name: string
  unit: DietUnit
  calories_per_unit: number
  calories_multiplier?: number
  amount: number
  quantity?: number
  total_calories: number
  recorded_time: string
}

type DietDay = {
  dayKey: string
  label: string
  totalCalories: number
  recordCount: number
}

type DietSummary = {
  config: { standard_calories: number; diet_start_date?: string | null }
  foods: DietFood[]
  recentFoods: DietFood[]
  records: DietRecord[]
  dailyStats: Array<{ day_key: string; total_calories: number; record_count: number }>
  days: DietDay[]
  month: string
}

const router = useRouter()
const loading = ref(true)
const selectedDayKey = ref(currentDayKey())
const summary = ref<DietSummary>({
  config: { standard_calories: 2000 },
  foods: [],
  recentFoods: [],
  records: [],
  dailyStats: [],
  days: [],
  month: '',
})
const selectedMonth = ref<string | null>(null)

const settingsModal = reactive({
  show: false,
  saving: false,
  standardCalories: 2000,
  dietStartDate: null as string | null,
})

const recordModal = reactive({
  show: false,
  saving: false,
  stage: 1 as 1 | 2,
  query: '',
  name: '',
  unit: 'u' as DietUnit,
  caloriesUnit: 'kCal' as DietCaloriesUnit,
  caloriesValue: '',
  caloriesMultiplier: '100',
  amountValue: '',
  quantityValue: '1',
})

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentDayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function buildMonthOptions(centerMonth = currentMonthKey(), offset = 5) {
  const [year, month] = centerMonth.split('-').map(Number)
  const options: string[] = []
  for (let delta = offset; delta >= 0; delta -= 1) {
    const date = new Date(year, month - 1, 1)
    date.setMonth(date.getMonth() - delta)
    options.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return options
}

const navItems = [
  { key: 'back', label: '‹ 返回' },
  { key: 'add', label: '添加' },
]

const monthOptions = computed(() => buildMonthOptions())
const currentDay = computed(() => currentDayKey())
const totalCalories = computed(() => summary.value.days.reduce((total, day) => total + day.totalCalories, 0))
const maxDayCalories = computed(() => Math.max(...summary.value.days.map(day => day.totalCalories), 1))
const maxCalories = computed(() => maxDayCalories.value)
const thresholdBottom = computed(() => {
  const standard = Math.max(summary.value.config.standard_calories, 1)
  const highest = Math.max(maxDayCalories.value, 1)
  if (highest < standard) return 100
  return Math.max(0, Math.min(100, (standard / highest) * 100))
})

const recentFoods = computed(() => summary.value.recentFoods.slice(0, 5))
const searchFoods = computed(() => {
  const keyword = recordModal.query.trim().toLowerCase()
  const source = keyword ? summary.value.foods.filter(food => food.name.toLowerCase().includes(keyword)) : summary.value.recentFoods
  return source.slice(0, 10)
})

const selectedFood = computed(() => summary.value.foods.find(food => food.name === recordModal.name.trim()) || null)
const latestFoodRecord = (name: string) => {
  const matched = summary.value.records
    .filter(record => record.food_name === name)
    .sort((a, b) => new Date(b.recorded_time).getTime() - new Date(a.recorded_time).getTime())
  return matched[0] || null
}
const amountUnitOption = 'u'

const displayUnit = (unit?: string) => (unit === 'g/ml' ? 'u' : (unit === 'u' ? 'u' : (unit as DietUnit) || 'u'))

const parseRecordInput = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const getRecordCaloriesValue = () => {
  return parseRecordInput(recordModal.caloriesValue)
}

const getRecordCaloriesMultiplier = () => {
  return Math.max(parseRecordInput(recordModal.caloriesMultiplier), 1)
}

const getRecordAmount = () => {
  const amount = parseRecordInput(recordModal.amountValue)
  return Number.isFinite(amount) && amount > 0 ? amount : 1
}

const getRecordQuantity = () => {
  const quantity = parseRecordInput(recordModal.quantityValue)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

const getRecordTotalCalories = () => {
  return getRecordAmount() * getRecordQuantity() * getRecordCaloriesValueInKCal() / getRecordCaloriesMultiplier()
}

const formatDietNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

const chartBars = computed(() => summary.value.days.map(day => {
  const overStandard = day.totalCalories > summary.value.config.standard_calories
  return {
    ...day,
    overStandard,
    height: day.totalCalories > 0 ? Math.max(4, (day.totalCalories / maxCalories.value) * 100) : 0,
  }
}))

const selectedDay = computed(() => summary.value.days.find(day => day.dayKey === selectedDayKey.value) || summary.value.days[summary.value.days.length - 1] || null)
const selectedDayLabel = computed(() => {
  if (!selectedDay.value) return '记录'
  if (selectedDay.value.dayKey === currentDay.value) return '今天'
  return selectedDay.value.dayKey
})

const caloriesUnitOptions: DietCaloriesUnit[] = ['%', 'kCal', 'kJ']

const selectedRecordDayKey = computed(() => selectedDayKey.value || currentDay.value)

const selectedRecordDayDate = computed(() => dayKeyToDate(selectedRecordDayKey.value))

const selectedRecordDayLabel = computed(() => formatRecordDayLabel(selectedRecordDayDate.value))

const selectedRecordDayIsToday = computed(() => selectedRecordDayKey.value === currentDay.value)

const yesterdayDayKey = computed(() => {
  const date = dayKeyToDate(currentDay.value)
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
})

const effectiveDietStartDayKey = computed(() => {
  const startDayKey = summary.value.config.diet_start_date?.trim()
  if (!startDayKey) return null
  return startDayKey > currentDay.value ? currentDay.value : startDayKey
})

const getDaySpanCount = (startDayKey: string, endDayKey: string) => {
  const startDate = dayKeyToDate(startDayKey)
  const endDate = dayKeyToDate(endDayKey)
  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000)
  return Math.max(0, diffDays + 1)
}

const weightChangeLabel = computed(() => {
  const startDayKey = effectiveDietStartDayKey.value
  if (!startDayKey) return ''

  const endDayKey = yesterdayDayKey.value
  if (startDayKey > endDayKey) return '0天0kg'

  const daysInRange = summary.value.days.filter(day => day.dayKey >= startDayKey && day.dayKey <= endDayKey)
  if (!daysInRange.length) return '0天0kg'

  const actualCalories = daysInRange.reduce((sum, day) => sum + day.totalCalories, 0)
  const expectedCalories = daysInRange.length * 2000
  const weightKg = (actualCalories - expectedCalories) / 7 / 1000
  const dayCount = getDaySpanCount(startDayKey, endDayKey)
  return `${dayCount}天${weightKg >= 0 ? '+' : ''}${weightKg.toFixed(1)}kg`
})

const selectedDayRecords = computed(() => {
  const list = summary.value.records.filter(record => {
    const recorded = new Date(record.recorded_time)
    const recordedKey = `${recorded.getFullYear()}-${String(recorded.getMonth() + 1).padStart(2, '0')}-${String(recorded.getDate()).padStart(2, '0')}`
    return recordedKey === selectedDayKey.value
  })
  return [...list].sort((a, b) => new Date(a.recorded_time).getTime() - new Date(b.recorded_time).getTime())
})

const selectedDayTotalCalories = computed(() => selectedDayRecords.value.reduce((sum, record) => sum + record.total_calories, 0))

const getStoredCaloriesMultiplier = (value?: number) => value && value > 0 ? value : 100

type ProgressSegment = {
  key: string
  name: string
  calories: number
  width: number
  color: string
  isFirstInRow: boolean
}

type ProgressRow = {
  key: string
  segments: ProgressSegment[]
}

const getBarFillColor = (totalCalories: number) => {
  const standard = Math.max(summary.value.config.standard_calories, 1)
  const overCalories = Math.max(0, totalCalories - standard)
  if (overCalories <= 0) return 'hsl(126, 56%, 42%)'

  const progress = Math.min(1, overCalories / 500)
  const start = { r: 46, g: 204, b: 113 }
  const end = { r: 255, g: 77, b: 79 }
  const r = Math.round(start.r + (end.r - start.r) * progress)
  const g = Math.round(start.g + (end.g - start.g) * progress)
  const b = Math.round(start.b + (end.b - start.b) * progress)
  return `rgb(${r}, ${g}, ${b})`
}

function dayKeyToDate(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  if (!year || !month || !day) return new Date()
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

function formatRecordDayLabel(date: Date) {
  const todayKey = currentDayKey()
  const targetKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const todayDate = dayKeyToDate(todayKey)
  const diffDays = Math.round((todayDate.getTime() - dayKeyToDate(targetKey).getTime()) / 86400000)
  const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`

  if (diffDays === 1) return `昨天（${monthDay}）`
  if (diffDays === 2) return `前天（${monthDay}）`
  return monthDay
}

const getRecordDateTime = () => {
  const date = selectedRecordDayDate.value
  return date.toISOString()
}

const normalizeCaloriesDisplayValue = (value: number, unit: DietCaloriesUnit) => {
  if (!Number.isFinite(value)) return 0
  if (unit === 'kCal') return value
  if (unit === '%') return value * 2000 / 100
  return value / 4.184
}

const getRecordCaloriesValueInKCal = () => {
  return normalizeCaloriesDisplayValue(parseRecordInput(recordModal.caloriesValue), recordModal.caloriesUnit)
}

const formatRelativeDayLabel = (dayKey?: string | null) => {
  if (!dayKey) return '未设置'
  return formatRecordDayLabel(dayKeyToDate(dayKey))
}

const getDisplayCaloriesValue = (value: number, multiplier?: number) => {
  return multiplier && multiplier > 0 ? value : value * 100
}

const getFoodDisplayCalories = (food: DietFood) => {
  return getDisplayCaloriesValue(food.calories_per_unit, food.calories_multiplier)
}

const getFoodDisplayMultiplier = (food: DietFood) => getStoredCaloriesMultiplier(food.calories_multiplier)

const getRecordDisplayCalories = (record: DietRecord) => {
  return getDisplayCaloriesValue(record.calories_per_unit, record.calories_multiplier)
}

const getRecordDisplayMultiplier = (record: DietRecord) => getStoredCaloriesMultiplier(record.calories_multiplier)

function mixGreenToRed(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress))
  const start = { r: 46, g: 204, b: 113 }
  const end = { r: 255, g: 77, b: 79 }
  const r = Math.round(start.r + (end.r - start.r) * clamped)
  const g = Math.round(start.g + (end.g - start.g) * clamped)
  const b = Math.round(start.b + (end.b - start.b) * clamped)
  return `rgb(${r}, ${g}, ${b})`
}

const getSegmentProgress = (unitCalories: number, totalCalories: number) => {
  const unitScore = Math.max(0, Math.min(1, (unitCalories - 100) / 400))
  const totalScore = Math.max(0, Math.min(1, (totalCalories - 500) / 500))
  return Math.min(1, Math.sqrt(unitScore * unitScore + totalScore * totalScore))
}

const selectedDayProgressRows = computed(() => {
  const lineCapacity = 1500
  const rows: ProgressRow[] = []
  let currentRow = { key: 'row-0', segments: [] as ProgressSegment[] }
  let rowUsed = 0

  const pushRowIfNeeded = () => {
    if (currentRow.segments.length) {
      rows.push(currentRow)
    }
  }

  selectedDayRecords.value.forEach((record, recordIndex) => {
    let remaining = Math.max(0, record.total_calories)
    const unitCalories = getRecordDisplayCalories(record)
    const color = mixGreenToRed(getSegmentProgress(unitCalories, remaining))

    while (remaining > 0) {
      if (rowUsed >= lineCapacity) {
        pushRowIfNeeded()
        currentRow = { key: `row-${rows.length}`, segments: [] }
        rowUsed = 0
      }

      const available = lineCapacity - rowUsed
      const pieceCalories = Math.min(remaining, available)
      currentRow.segments.push({
        key: `${record._id}-${recordIndex}-${currentRow.segments.length}`,
        name: record.food_name,
        calories: pieceCalories,
        width: (pieceCalories / lineCapacity) * 100,
        color,
        isFirstInRow: currentRow.segments.length === 0,
      })

      rowUsed += pieceCalories
      remaining -= pieceCalories

      if (rowUsed >= lineCapacity) {
        pushRowIfNeeded()
        currentRow = { key: `row-${rows.length}`, segments: [] }
        rowUsed = 0
      }
    }
  })

  pushRowIfNeeded()
  return rows
})

const loadSummary = async () => {
  loading.value = true
  try {
    const params = selectedMonth.value ? { month: selectedMonth.value } : {}
    const data = await request('diet/summary', 'GET', params)
    const normalizedSummary = data as DietSummary
    normalizedSummary.foods = normalizedSummary.foods.map(food => ({ ...food, unit: displayUnit(food.unit) as DietUnit }))
    normalizedSummary.recentFoods = normalizedSummary.recentFoods.map(food => ({ ...food, unit: displayUnit(food.unit) as DietUnit }))
    normalizedSummary.records = normalizedSummary.records.map(record => ({ ...record, unit: displayUnit(record.unit) as DietUnit }))
    summary.value = normalizedSummary
    settingsModal.standardCalories = summary.value.config.standard_calories
    settingsModal.dietStartDate = summary.value.config.diet_start_date && summary.value.config.diet_start_date > currentDay.value
      ? currentDay.value
      : summary.value.config.diet_start_date || null
    if (!summary.value.days.find(day => day.dayKey === selectedDayKey.value)) {
      selectedDayKey.value = summary.value.days.find(day => day.dayKey === currentDay.value)?.dayKey || summary.value.days[summary.value.days.length - 1]?.dayKey || currentDay.value
    }
  } finally {
    loading.value = false
  }
}

const resetRecordModal = () => {
  recordModal.stage = 1
  recordModal.query = ''
  recordModal.name = ''
  recordModal.unit = 'u'
  recordModal.caloriesValue = ''
  recordModal.caloriesMultiplier = '100'
  recordModal.amountValue = '1'
  recordModal.quantityValue = '1'
}

const openRecordModal = () => {
  recordModal.show = true
  resetRecordModal()
  recordModal.caloriesUnit = 'kCal'
}

const openSettingsModal = () => {
  settingsModal.show = true
  settingsModal.standardCalories = summary.value.config.standard_calories
  settingsModal.dietStartDate = summary.value.config.diet_start_date && summary.value.config.diet_start_date > currentDay.value
    ? currentDay.value
    : summary.value.config.diet_start_date || null
}

const closeRecordModal = () => {
  recordModal.show = false
  resetRecordModal()
}

const applyFood = (food: DietFood) => {
  const latestRecord = latestFoodRecord(food.name)
  const caloriesMultiplier = getStoredCaloriesMultiplier(latestRecord?.calories_multiplier ?? food.calories_multiplier)
  const caloriesValue = formatDietNumber(getDisplayCaloriesValue(latestRecord?.calories_per_unit ?? food.calories_per_unit, latestRecord?.calories_multiplier ?? food.calories_multiplier))
  recordModal.name = food.name
  recordModal.query = food.name
  recordModal.unit = 'u'
  recordModal.caloriesUnit = 'kCal'
  recordModal.caloriesValue = caloriesValue
  recordModal.caloriesMultiplier = formatDietNumber(caloriesMultiplier)
  recordModal.amountValue = formatDietNumber(latestRecord?.amount ?? 1)
  recordModal.quantityValue = '1'
  recordModal.stage = 2
}

const confirmFood = () => {
  const name = recordModal.query.trim()
  if (!name) return
  const existing = summary.value.foods.find(food => food.name === name)
  if (existing) {
    applyFood(existing)
    return
  }
  recordModal.name = name
  recordModal.query = name
  recordModal.stage = 2
  recordModal.unit = 'u'
  recordModal.caloriesUnit = 'kCal'
  recordModal.caloriesValue = ''
  recordModal.caloriesMultiplier = '100'
  recordModal.amountValue = '1'
  recordModal.quantityValue = '1'
}

const formatCaloriesPer100 = (food: DietFood) => `${formatDietNumber(getFoodDisplayCalories(food))}kCal/${formatDietNumber(getFoodDisplayMultiplier(food))}${displayUnit(food.unit)}`
const formatCaloriesExpression = (
  caloriesValue: number,
  caloriesMultiplier: number,
  unit: string,
  amount?: number,
  amountUnit?: string,
  quantity?: number,
  totalCalories?: number,
) => {
  const caloriesPart = `${formatDietNumber(caloriesValue)}kCal/${formatDietNumber(caloriesMultiplier)}${unit}`
  if (amount === undefined || amountUnit === undefined || totalCalories === undefined) {
    return caloriesPart
  }
  const safeQuantity = quantity && quantity > 0 ? quantity : 1
  return `${caloriesPart}*${formatDietNumber(amount)}${amountUnit}*${formatDietNumber(safeQuantity)}=${formatDietNumber(totalCalories)}kCal`
}

const backToFoodSelect = () => {
  recordModal.stage = 1
}

const selectDay = (dayKey: string) => {
  selectedDayKey.value = dayKey
}

const deleteRecord = async (recordId: string) => {
  const ok = window.confirm('确定删除这条记录？')
  if (!ok) return
  await request(`diet/record/${recordId}`, 'DELETE')
  await loadSummary()
}

const saveRecord = async () => {
  const name = recordModal.name.trim()
  if (!name) return
  recordModal.saving = true
  try {
    const caloriesPerUnit = Math.round(getRecordCaloriesValueInKCal() * 100) / 100
    const amount = getRecordAmount()
    const quantity = getRecordQuantity()
    await request('diet/record', 'POST', {
      name,
      unit: recordModal.unit,
      amount,
      quantity,
      caloriesPerUnit,
      caloriesMultiplier: getRecordCaloriesMultiplier(),
      recordedTime: getRecordDateTime(),
    })
    closeRecordModal()
    await loadSummary()
  } finally {
    recordModal.saving = false
  }
}

const saveSettings = async (dietStartDate: string | null = settingsModal.dietStartDate) => {
  settingsModal.saving = true
  try {
    const normalizedDietStartDate = dietStartDate && dietStartDate > currentDay.value ? currentDay.value : dietStartDate
    await request('diet/config', 'POST', {
      standardCalories: settingsModal.standardCalories,
      dietStartDate: normalizedDietStartDate,
    })
    settingsModal.show = false
    await loadSummary()
  } finally {
    settingsModal.saving = false
  }
}

const setDietStartDateToSelectedDay = () => {
  settingsModal.dietStartDate = selectedDayKey.value > currentDay.value ? currentDay.value : selectedDayKey.value
}

const clearDietStartDate = () => {
  settingsModal.dietStartDate = null
}

const calorieGradient = (ratio: number) => {
  return ratio > 1
    ? 'linear-gradient(90deg, hsl(0, 82%, 48%), hsl(2, 92%, 62%))'
    : 'linear-gradient(90deg, hsl(126, 56%, 42%), hsl(140, 56%, 50%))'
}

const goBack = () => {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'playground' })
  }
}

const onBottomNavSelect = (key: string) => {
  if (key === 'back') {
    goBack()
    return
  }
  if (key === 'add') {
    openRecordModal()
  }
}

const updateMonth = (value: string | number | null) => {
  if (typeof value === 'string' && value) {
    selectedMonth.value = value
    return
  }
  selectedMonth.value = null
}

const updateCaloriesUnit = (value: number | string | null) => {
  if (value === '%' || value === 'kCal' || value === 'kJ') {
    recordModal.caloriesUnit = value
  }
}

watch(selectedMonth, () => {
  void loadSummary()
})

onMounted(() => {
  void loadSummary()
})
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="page-head">
        <Btn class="settings-btn" small @click="openSettingsModal">设置</Btn>
      </div>

      <Card class="summary-card">
        <div class="summary-head">
          <StepperFilter
            :value="selectedMonth"
            :options="monthOptions"
            :nullable="true"
            nullable-position="max"
            @update:value="updateMonth"
          />
          <div class="summary-weight-change">{{ weightChangeLabel }}</div>
        </div>

        <div class="chart-wrap">
          <div class="chart-bars">
            <div class="threshold-line" :style="{ bottom: `${thresholdBottom}%` }"></div>
            <button v-for="day in chartBars" :key="day.dayKey" class="bar-item" :class="{ active: day.dayKey === selectedDayKey }" @click="selectDay(day.dayKey)">
              <div class="bar-track">
                <div class="bar-fill" :style="{ height: `${day.height}%`, background: getBarFillColor(day.totalCalories) }"></div>
              </div>
            </button>
          </div>
        </div>
      </Card>

      <Card class="today-card">
        <div class="card-head">
          <div class="card-title">{{ selectedDayLabel }}</div>
          <div class="card-sub">{{ Math.round(selectedDayTotalCalories) }} / {{ summary.config.standard_calories }} kcal</div>
        </div>

        <div class="today-progress" v-if="selectedDayRecords.length && selectedDayProgressRows.length">
          <div v-for="row in selectedDayProgressRows" :key="row.key" class="today-progress-track">
            <div
              v-for="segment in row.segments"
              :key="segment.key"
              class="today-progress-segment"
              :style="{
                width: `${segment.width}%`,
                background: segment.color,
                borderLeft: segment.isFirstInRow ? 'none' : '1px solid rgba(255, 255, 255, 0.72)',
              }"
              :title="`${segment.name} ${Math.round(segment.calories)}kCal`"
            ></div>
          </div>
        </div>

        <div class="today-items" v-if="selectedDayRecords.length">
          <div v-for="record in selectedDayRecords" :key="record._id" class="today-item">
            <div class="today-item-row">
              <div class="today-item-name">{{ record.food_name }}{{ (record.quantity || 1) > 1 ? 'x' + formatDietNumber(record.quantity || 1) : '' }}</div>
              <div class="today-item-meta">
                {{ formatCaloriesExpression(getRecordDisplayCalories(record), getRecordDisplayMultiplier(record), record.unit, record.amount, amountUnitOption, record.quantity, record.total_calories) }}
              </div>
              <div class="today-item-actions">
                <CircleBtn class="delete-btn" variant="overlay" icon="close" aria-label="delete record" :size="16" :mobile-size="20" @click.stop="deleteRecord(record._id)" />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-state">这一天还没有记录。</div>
      </Card>

      <div v-if="recordModal.show" class="modal-mask" @click.self="closeRecordModal">
        <Card class="modal">
          <div class="modal-head">
            <div class="modal-title">记录热量</div>
            <div v-if="!selectedRecordDayIsToday" class="modal-title-date">{{ selectedRecordDayLabel }}</div>
          </div>

          <template v-if="recordModal.stage === 1">
            <div class="search-row">
              <Input v-model="recordModal.query" placeholder="输入食物名称" @keyup.enter="confirmFood" />
              <Btn class="search-confirm" type="primary" @click="confirmFood">下一步</Btn>
            </div>

            <div class="chooser-list">
              <div v-for="food in searchFoods" :key="food._id" class="chooser-item" @click="applyFood(food)">
                <div class="chooser-item-row">
                  <div class="chooser-name">{{ food.name }}</div>
                  <div class="chooser-meta">{{ formatCaloriesPer100(food) }}</div>
                </div>
              </div>
              <div v-if="!searchFoods.length" class="chooser-empty">暂无可选食物</div>
            </div>
          </template>

          <template v-else>
            <div class="selected-food-wrap">
              <div class="selected-food">
                <div class="selected-food-name">{{ recordModal.name }}</div>
              </div>
              <div class="selected-food-qty">
                <span class="selected-food-qty-label">数量</span>
                <Input class="quantity-input" v-model="recordModal.quantityValue" type="number" min="1" step="1" placeholder="1" />
              </div>
            </div>

            <div class="field-group">
              <div class="field-label">输入热量</div>
              <div class="field-row">
                <Input class="value-input" v-model="recordModal.caloriesValue" type="number" min="0" step="0.1" :placeholder="recordModal.caloriesUnit" />
                <StepperFilter
                  :value="recordModal.caloriesUnit"
                  :options="caloriesUnitOptions"
                  :nullable="false"
                  :btn-size="20"
                  :btn-font-size="11"
                  :btn-mobile-size="22"
                  :btn-mobile-font-size="11"
                  @update:value="updateCaloriesUnit"
                />
                <Input class="unit-multiplier-input" v-model="recordModal.caloriesMultiplier" type="number" min="1" step="1" placeholder="100" />
                <span class="unit-text">u</span>
              </div>
            </div>

            <div class="field-group">
              <div class="field-label">输入分量</div>
              <div class="field-row">
                <Input class="value-input" v-model="recordModal.amountValue" type="number" min="1" step="1" placeholder="1" />
                <span class="unit-text">u</span>
              </div>
            </div>

            <div class="record-preview">
              预计总热量：{{ Math.round(getRecordTotalCalories()) }} kcal
            </div>

            <div class="modal-actions">
              <Btn @click="backToFoodSelect">上一步</Btn>
              <Btn type="primary" :loading="recordModal.saving" @click="saveRecord">确定</Btn>
            </div>
          </template>
        </Card>
      </div>

      <div v-if="settingsModal.show" class="modal-mask" @click.self="settingsModal.show = false">
        <Card class="modal settings-modal">
          <div class="modal-title">设置</div>
          <div class="field-group">
            <div class="field-label">每日标准 kcal</div>
            <Input v-model="settingsModal.standardCalories" type="number" min="1" step="1" />
          </div>
          <div class="field-group">
            <div class="field-label">减肥起始日期</div>
            <div class="diet-start-row">
              <div class="diet-start-date">{{ formatRelativeDayLabel(settingsModal.dietStartDate) }}</div>
              <div class="diet-start-actions">
                <Btn small @click="setDietStartDateToSelectedDay">设为当天</Btn>
                  <Btn small type="danger" @click="clearDietStartDate">取消</Btn>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <Btn @click="settingsModal.show = false">取消</Btn>
            <Btn type="primary" :loading="settingsModal.saving" @click="saveSettings()">保存</Btn>
          </div>
        </Card>
      </div>

      <BottomNavBar :items="navItems" @select="onBottomNavSelect" />
    </template>
  </List>
</template>

<style scoped lang="less">
.page-head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.settings-btn {
  flex: 0 0 auto;
}

.summary-card,
.today-card,
.modal {
  border-radius: 0.9rem;
}

.summary-card,
.today-card {
  padding: 0.85rem;
  margin-bottom: 0.75rem;
}

.summary-head,
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.summary-weight-change {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.modal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.month-title,
.card-title,
.modal-title {
  font-size: 16px;
  font-weight: 700;
  text-align: left;
}

.modal-title-date {
  color: var(--text-secondary);
  font-size: 13px;
  text-align: right;
  white-space: nowrap;
}

.hero-sub,
.card-sub,
.selected-food-meta,
.record-preview,
.today-item-meta,
.chooser-meta {
  color: var(--text-secondary);
  font-size: 12px;
}

.chart-wrap {
  position: relative;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  overflow-x: auto;
}

.threshold-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed rgba(255, 90, 90, 0.8);
  pointer-events: none;
  z-index: 3;
}

.chart-bars {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 4px;
  width: max-content;
  min-width: 100%;
  height: 120px;
}

.bar-item {
  position: relative;
  z-index: 1;
  appearance: none;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  flex: 0 0 4px;
  width: 4px;
  min-width: 4px;
  height: 100%;
}

.bar-item.active .bar-fill {
  box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.25), 0 6px 18px rgba(0, 0, 0, 0.12);
}

.bar-track {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: end;
}

.bar-fill {
  width: 4px;
  border-radius: 999px 999px 0.2rem 0.2rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
}

.today-progress {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.35rem;
}

.today-progress-track {
  display: flex;
  width: 100%;
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.today-progress-segment {
  height: 100%;
  min-width: 1px;
  flex-shrink: 0;
}

.today-progress-empty {
  margin-top: 0.75rem;
  color: var(--text-secondary);
  font-size: 13px;
}

.today-items {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.5rem;
}

.today-item {
  padding: 0.6rem 0.7rem;
  border-radius: 0.75rem;
  background: var(--bg);
}

.today-item-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.75rem;
}

.today-item-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.today-item-meta {
  min-width: 0;
  text-align: right;
}

.today-item-actions {
  display: flex;
  justify-content: flex-end;
  align-self: start;
}

.delete-btn {
  color: #ff4d4f;
}

.field-group {
  margin-top: 0.9rem;
  text-align: left;
}

.diet-start-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.diet-start-date {
  color: var(--text-secondary);
  font-size: 13px;
  min-width: 0;
}

.diet-start-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.field-label {
  margin-bottom: 0.35rem;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;

  .value-input {
    flex: 1 1 auto;
  }

  .unit-multiplier-input {
    flex: 0 0 64px;
  }
}

.search-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.75rem;
  .input {
    flex: 1 1 auto;
  }
}


.chooser-list {
  display: grid;
  gap: 0.4rem;
  margin-top: 0.75rem;
  max-height: 240px;
  overflow: auto;
}

.chooser-item {
  padding: 0.55rem 0.65rem;
  border-radius: 0.7rem;
  background: var(--bg);
  cursor: pointer;
  text-align: left;

  &:hover {
    background: rgba(66, 185, 131, 0.12);
  }
}

.chooser-item-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.chooser-name {
  font-size: 13px;
  font-weight: 600;
}

.chooser-empty,
.empty-state {
  margin-top: 0.75rem;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: left;
}

.selected-food {
  padding: 0.65rem 0.7rem;
  border-radius: 0.75rem;
  background: var(--bg);
  text-align: left;
  flex: 1 1 auto;
}

.selected-food-wrap {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.75rem;
}

.selected-food-name {
  font-size: 14px;
  font-weight: 700;
}

.selected-food-qty {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.selected-food-qty-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.quantity-input {
  width: 58px;
}

.unit-text {
  min-width: 16px;
  text-align: center;
  font-size: 14px;
  line-height: 1;
  color: var(--text);
}

.record-preview {
  margin-top: 0.75rem;
  text-align: left;
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.modal {
  width: min(100%, 720px);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  background: var(--card-bg);
  padding: 0.95rem;
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.18);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.9rem;
}

@media (max-width: 768px) {
  .summary-head,
  .card-head {
    grid-template-columns: 1fr;
    display: grid;
  }

  .summary-head,
  .card-head {
    gap: 0.5rem;
  }

  .chart-bars {
    gap: 6px;
    height: 96px;
  }

  .selected-food-wrap {
    align-items: stretch;
  }
}
</style>