<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import List from '@/components/layout/List.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import Card from '@/components/Card.vue'
import Btn from '@/components/Btn.vue'
import CircleBtn from '@/components/CircleBtn.vue'
import Input from '@/components/Input.vue'
import StepperFilter from '@/components/StepperFilter.vue'
import { request } from '@/utils/request'
import { useUserStore } from '@/store/user'
import { useToastStore } from '@/store/toast'

type DietUnit = 'u'
type DietCaloriesUnit = '%' | 'kCal' | 'kJ'

type DietFood = {
  _id: string
  name: string
  unit: DietUnit
  calories_per_unit: number
  calories_multiplier?: number
  amount?: number
  quantity?: number
  last_used_time?: string
  updated_time?: string
}

type DietRecord = {
  _id: string
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
  totalNegativeCalories: number
  recordCount: number
}

type DietSummary = {
  foods: DietFood[]
  recentFoods: DietFood[]
  records: DietRecord[]
  dailyStats: Array<{ day_key: string; total_calories: number; record_count: number }>
  days: DietDay[]
  month: string
  weightChangeLabel: string
  weights?: Array<{ day_key: string; weight: number }>
  config?: { standard_calories?: number | string; diet_start_date?: string | null }
}

const router = useRouter()
const userStore = useUserStore()
const toastStore = useToastStore()
const { userInfo } = storeToRefs(userStore)
const loading = ref(true)
const selectedDayKey = ref(currentDayKey())
const summary = ref<DietSummary>({
  foods: [],
  recentFoods: [],
  records: [],
  dailyStats: [],
  days: [],
  month: '',
  weightChangeLabel: '',
  weights: [],
})
const selectedMonth = ref<string | null>(null)

const settingsModal = reactive({
  show: false,
  saving: false,
  standardCalories: 2000,
  dietStartDate: null as string | null,
  targetWeight: '' as string | number,
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
  caloriesMultiplier: '',
  amountValue: '',
  quantityValue: '',
  // 建议值以 placeholder 呈现：输入为空时按 placeholder 计算，直接输入即覆盖
  caloriesPlaceholder: '',
  multiplierPlaceholder: '100',
  amountPlaceholder: '100',
  quantityPlaceholder: '1',
})

function currentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function currentDayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function prevDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  const prev = new Date(year, month - 1, day)
  prev.setDate(prev.getDate() - 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
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

// 非管理员只读：只看统计图，无设置/添加/当天记录
const isAdmin = computed(() => Number(userInfo.value?.role) === 3)
const navItems = computed(() => {
  const items = [{ key: 'back', label: '‹ 返回' }]
  if (isAdmin.value) {
    items.push({ key: 'add', label: '添加' })
  }
  return items
})

const monthOptions = computed(() => buildMonthOptions())
const currentDay = computed(() => currentDayKey())
const dietConfig = computed(() => {
  // 登录读用户设置；未登录（匿名只读视图）退回 summary 返回的配置
  const rawStandard = userInfo.value.settings?.diet?.standardCalories ?? (summary.value as any).config?.standard_calories
  const standardNumber = Number(rawStandard)
  const rawTargetWeight = (userInfo.value.settings?.diet as any)?.targetWeight
  const targetWeightNumber = Number(rawTargetWeight)
  return {
    standardCalories: Number.isFinite(standardNumber) && standardNumber > 0 ? standardNumber : 2000,
    dietStartDate: userInfo.value.settings?.diet?.dietStartDate || null,
    targetWeight: rawTargetWeight != null && rawTargetWeight !== '' && Number.isFinite(targetWeightNumber) && targetWeightNumber > 0
      ? targetWeightNumber
      : null,
  } as { standardCalories: number; dietStartDate: string | null; targetWeight: number | null }
})
const totalCalories = computed(() => summary.value.days.reduce((total, day) => total + day.totalCalories - (day.totalNegativeCalories || 0), 0))
const maxDayCalories = computed(() => Math.max(...summary.value.days.map(day => Math.max(0, day.totalCalories)), 1))
// 纵轴上限至少包含每日标准，保证标准线始终画在图内
const maxCalories = computed(() => Math.max(maxDayCalories.value, dietConfig.value.standardCalories))
const thresholdBottom = computed(() => {
  const standard = Math.max(dietConfig.value.standardCalories, 1)
  // 与柱子同一纵轴（maxCalories 已包含每日标准），保证标准线落在图内
  const highest = Math.max(maxCalories.value, 1)
  return Math.max(0, Math.min(100, (standard / highest) * 100))
})

const recentFoods = computed(() => summary.value.recentFoods.slice(0, 5))
const searchFoods = computed(() => {
  const keyword = recordModal.query.trim().toLowerCase()
  const source = keyword ? summary.value.foods.filter(food => food.name.toLowerCase().includes(keyword)) : summary.value.recentFoods
  return source.slice(0, 10)
})

const selectedFood = computed(() => summary.value.foods.find(food => food.name === recordModal.name.trim()) || null)
const amountUnitOption = 'u'

const displayUnit = (unit?: string) => (unit === 'g/ml' ? 'u' : (unit === 'u' ? 'u' : (unit as DietUnit) || 'u'))

const parseRecordInput = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

// 记录弹窗每个数值有三层来源，按优先级取（预计总热量和提交都只走下面的 getter，不直接读输入框）：
// 1. 新填入的值：用户本次在输入框里输入的内容（recordModal.*Value）
// 2. 前值：所选食物上次记录的值（applyFood 时写入 placeholder 展示）
// 3. 默认值：全新食物没有前值时的兜底（RECORD_DEFAULTS）
// placeholder 字段承载第 2/3 层：有前值用前值，没有用默认值；热量没有默认值，全新食物必须手动输入
const RECORD_DEFAULTS = {
  caloriesMultiplier: 100,
  amount: 100,
  quantity: 1,
}

const resolveRecordNumber = (input: string, placeholder: string, fallback: number) => {
  const parsed = parseRecordInput(input !== '' ? input : placeholder)
  return parsed > 0 ? parsed : fallback
}

// 热量没有默认值：全新食物必须手动输入
const getRecordCaloriesValue = () => {
  const raw = recordModal.caloriesValue !== '' ? recordModal.caloriesValue : recordModal.caloriesPlaceholder
  return parseRecordInput(raw)
}

const getRecordCaloriesMultiplier = () => {
  const resolved = resolveRecordNumber(recordModal.caloriesMultiplier, recordModal.multiplierPlaceholder, RECORD_DEFAULTS.caloriesMultiplier)
  return Math.max(resolved, 1)
}

const getRecordAmount = () => resolveRecordNumber(recordModal.amountValue, recordModal.amountPlaceholder, RECORD_DEFAULTS.amount)

const getRecordQuantity = () => resolveRecordNumber(recordModal.quantityValue, recordModal.quantityPlaceholder, RECORD_DEFAULTS.quantity)

const getRecordTotalCalories = () => {
  return getRecordAmount() * getRecordQuantity() * getRecordCaloriesValueInKCal() / getRecordCaloriesMultiplier()
}

const formatDietNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

const chartBars = computed(() => summary.value.days.map(day => {
  const grossPositive = Math.max(0, day.totalCalories)
  const grossNegative = day.totalNegativeCalories || 0
  const netHeight = Math.max(0, grossPositive - grossNegative)
  const barHeight = netHeight > 0 ? Math.max(4, (netHeight / maxCalories.value) * 100) : 0
  const negativeHeight = grossNegative > 0 ? Math.max(2, (grossNegative / maxCalories.value) * 100) : 0
  const barColor = getBarFillColor(day.totalCalories)
  return {
    ...day,
    barHeight,
    barColor,
    negativeHeight,
    hasNegative: grossNegative > 0,
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
  const startDayKey = dietConfig.value.dietStartDate?.trim()
  if (!startDayKey) return null
  return startDayKey > currentDay.value ? currentDay.value : startDayKey
})

const getDaySpanCount = (startDayKey: string, endDayKey: string) => {
  const startDate = dayKeyToDate(startDayKey)
  const endDate = dayKeyToDate(endDayKey)
  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000)
  return Math.max(0, diffDays + 1)
}

const weightChangeLabel = computed(() => summary.value.weightChangeLabel || '')

const selectedDayRecords = computed(() => {
  const list = summary.value.records.filter(record => {
    const recorded = new Date(record.recorded_time)
    const recordedKey = `${recorded.getFullYear()}-${String(recorded.getMonth() + 1).padStart(2, '0')}-${String(recorded.getDate()).padStart(2, '0')}`
    return recordedKey === selectedDayKey.value
  })
  return [...list].sort((a, b) => {
    const absDiff = Math.abs(b.total_calories) - Math.abs(a.total_calories)
    if (absDiff !== 0) return absDiff
    return new Date(a.recorded_time).getTime() - new Date(b.recorded_time).getTime()
  })
})

const selectedDayTotalCalories = computed(() => selectedDayRecords.value.reduce((sum, record) => sum + record.total_calories, 0))
const selectedDayMaxItemCalories = computed(() => Math.max(...selectedDayRecords.value.map(record => Math.abs(record.total_calories)), 1))
const selectedDayItemScaleCalories = computed(() => Math.max(dietConfig.value.standardCalories, selectedDayMaxItemCalories.value, 1))

const getStoredCaloriesMultiplier = (value?: number) => value && value > 0 ? value : 100

const getBarFillColor = (totalCalories: number) => {
  const standard = Math.max(dietConfig.value.standardCalories, 1)
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
  // 必须走 getRecordCaloriesValue（新填入的值 > 前值），直接读输入框会把留空的 placeholder 当 0
  return normalizeCaloriesDisplayValue(getRecordCaloriesValue(), recordModal.caloriesUnit)
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

const getTodayItemFillStyle = (record: DietRecord) => {
  const denominator = Math.max(selectedDayItemScaleCalories.value, 1)
  const calories = Math.abs(record.total_calories)
  const ratio = Math.min(1, calories / denominator)

  return {
    width: `${ratio * 100}%`,
    background: record.total_calories < 0 ? mixBlue(50 + ratio * 200) : mixGreenToRed(ratio),
  }
}

function mixBlue(progress: number) {
  const clamped = Math.max(0, Math.min(1, (progress - 50) / 200))
  const start = { r: 200, g: 225, b: 255 }
  const end = { r: 20, g: 80, b: 200 }
  const r = Math.round(start.r + (end.r - start.r) * clamped)
  const g = Math.round(start.g + (end.g - start.g) * clamped)
  const b = Math.round(start.b + (end.b - start.b) * clamped)
  return `rgb(${r}, ${g}, ${b})`
}

function mixGreenToRed(progress: number) {
  const clamped = Math.max(0, Math.min(1, progress))
  const start = { r: 46, g: 204, b: 113 }
  const end = { r: 255, g: 77, b: 79 }
  const r = Math.round(start.r + (end.r - start.r) * clamped)
  const g = Math.round(start.g + (end.g - start.g) * clamped)
  const b = Math.round(start.b + (end.b - start.b) * clamped)
  return `rgb(${r}, ${g}, ${b})`
}

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
    settingsModal.standardCalories = dietConfig.value.standardCalories
    settingsModal.dietStartDate = dietConfig.value.dietStartDate && dietConfig.value.dietStartDate > currentDay.value
      ? currentDay.value
      : dietConfig.value.dietStartDate || null
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
  recordModal.caloriesMultiplier = ''
  recordModal.amountValue = ''
  recordModal.quantityValue = ''
  recordModal.caloriesPlaceholder = ''
  recordModal.multiplierPlaceholder = formatDietNumber(RECORD_DEFAULTS.caloriesMultiplier)
  recordModal.amountPlaceholder = formatDietNumber(RECORD_DEFAULTS.amount)
  recordModal.quantityPlaceholder = formatDietNumber(RECORD_DEFAULTS.quantity)
}

const openRecordModal = () => {
  recordModal.show = true
  resetRecordModal()
  recordModal.caloriesUnit = 'kCal'
}

const openSettingsModal = () => {
  settingsModal.show = true
  settingsModal.standardCalories = dietConfig.value.standardCalories
  settingsModal.dietStartDate = dietConfig.value.dietStartDate && dietConfig.value.dietStartDate > currentDay.value
    ? currentDay.value
    : dietConfig.value.dietStartDate || null
  settingsModal.targetWeight = dietConfig.value.targetWeight != null ? formatDietNumber(dietConfig.value.targetWeight) : ''
}

const closeRecordModal = () => {
  recordModal.show = false
  resetRecordModal()
}

const applyFood = (food: DietFood) => {
  const caloriesMultiplier = getStoredCaloriesMultiplier(food.calories_multiplier)
  const displayCalories = getFoodDisplayCalories(food)
  recordModal.name = food.name
  recordModal.query = food.name
  recordModal.unit = 'u'
  recordModal.caloriesUnit = 'kCal'
  // 前值以 placeholder 展示，输入框留空可直接覆盖
  recordModal.caloriesValue = ''
  recordModal.caloriesMultiplier = ''
  recordModal.amountValue = ''
  recordModal.quantityValue = ''
  // 前值恰为 0 视为脏数据（历史提交 bug 产生），不作为前值；负值（如跑步）是合法前值
  recordModal.caloriesPlaceholder = displayCalories !== 0 ? formatDietNumber(displayCalories) : ''
  recordModal.multiplierPlaceholder = formatDietNumber(caloriesMultiplier)
  recordModal.amountPlaceholder = formatDietNumber(food.amount && food.amount > 0 ? food.amount : 1)
  recordModal.quantityPlaceholder = formatDietNumber(food.quantity && food.quantity > 0 ? food.quantity : 1)
  recordModal.stage = 2
}

const confirmFood = () => {
  const name = recordModal.query.trim()
  if (!name) return
  const existing = summary.value.foods.find(food => food.name === name)
    || summary.value.recentFoods.find(food => food.name === name)
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
  recordModal.caloriesMultiplier = ''
  recordModal.amountValue = ''
  recordModal.quantityValue = ''
  recordModal.caloriesPlaceholder = ''
  recordModal.multiplierPlaceholder = formatDietNumber(RECORD_DEFAULTS.caloriesMultiplier)
  recordModal.amountPlaceholder = formatDietNumber(RECORD_DEFAULTS.amount)
  recordModal.quantityPlaceholder = formatDietNumber(RECORD_DEFAULTS.quantity)
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
  if (!isAdmin.value) return
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
    const targetWeightInput = Number(settingsModal.targetWeight)
    await userStore.updateSettings({
      diet: {
        standardCalories: settingsModal.standardCalories,
        dietStartDate: normalizedDietStartDate,
        targetWeight: settingsModal.targetWeight !== '' && settingsModal.targetWeight != null && Number.isFinite(targetWeightInput) && targetWeightInput > 0
          ? targetWeightInput
          : null,
      },
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

// ==================== 体重记录 ====================

const summaryWeights = computed<Array<{ day_key: string; weight: number }>>(
  () => (summary.value as any).weights || []
)

const selectedDayWeight = computed(() => {
  const hit = summaryWeights.value.find(item => item.day_key === selectedRecordDayKey.value)
  return hit ? hit.weight : null
})

// 行内输入框：填入即记录当日体重，清空即删除
const weightInput = ref('')

// 切换日期 / 刷新数据后回填当日体重（含两天体重相同的情况，按日期变化也要重置）
watch([selectedRecordDayKey, selectedDayWeight], ([, weight]) => {
  weightInput.value = weight != null ? formatDietNumber(weight) : ''
})

let weightCommitTimer: ReturnType<typeof setTimeout> | null = null
let weightCommitInFlight = false

const saveWeight = async (weight: number) => {
  try {
    await request('diet/weight', 'post', {
      dayKey: selectedRecordDayKey.value,
      weight,
    }, { withCredentials: false })
    toastStore.showToast({ content: '体重已记录', type: 'OK' })
    await loadSummary()
  } catch (err: any) {
    toastStore.showToast({ content: err?.response?.data?.message || err?.message || '保存失败，请稍后重试', type: 'ERR' })
  }
}

const deleteWeight = async () => {
  try {
    await request(`diet/weight/${selectedRecordDayKey.value}`, 'delete', undefined, { withCredentials: false })
    await loadSummary()
  } catch (err: any) {
    toastStore.showToast({ content: err?.response?.data?.message || err?.message || '删除失败，请稍后重试', type: 'ERR' })
  }
}

const commitWeight = async () => {
  if (!isAdmin.value || weightCommitInFlight) return
  const typed = weightInput.value.trim()
  const current = selectedDayWeight.value
  if (typed === '') {
    if (current != null) await deleteWeight()
    return
  }
  const weight = parseRecordInput(typed)
  if (!Number.isFinite(weight) || weight <= 0 || weight > 500) {
    toastStore.showToast({ content: '请输入有效体重', type: '!' })
    weightInput.value = current != null ? formatDietNumber(current) : ''
    return
  }
  if (weight === current) return
  weightCommitInFlight = true
  try {
    await saveWeight(weight)
  } finally {
    weightCommitInFlight = false
  }
}

/** blur 后稍作延迟再提交，给输入框自带的 clear 按钮留出取消窗口（clear = 删除，不应先存再删） */
const scheduleWeightCommit = () => {
  if (weightCommitTimer) clearTimeout(weightCommitTimer)
  weightCommitTimer = setTimeout(() => {
    weightCommitTimer = null
    void commitWeight()
  }, 150)
}

const onWeightInputClear = () => {
  if (weightCommitTimer) {
    clearTimeout(weightCommitTimer)
    weightCommitTimer = null
  }
  void commitWeight()
}

/**
 * 体重折线（覆盖在统计图上）：
 * - 设了目标体重：纵轴顶部 = 100kg，底部 = 目标体重 - 5kg 的固定刻度
 * - 未设目标体重：退回窗口内 min/max 归一化（上下各留 10% 边距）
 * - 窗口前/后紧邻的体重（服务端各多返回一条）也连进折线，把线延伸出图表边界，但不画节点
 */
const weightChart = computed(() => {
  const days = summary.value.days
  const n = days.length
  if (!n) return { inner: [] as { x: number; y: number; weight: number }[], line: '' }

  const firstDayKey = days[0].dayKey
  const lastDayKey = days[n - 1].dayKey
  const sorted = [...summaryWeights.value].sort((a, b) => (a.day_key < b.day_key ? -1 : 1))
  const before = sorted.length > 0 && sorted[0].day_key < firstDayKey ? sorted[0] : null
  const after = sorted.length > 0 && sorted[sorted.length - 1].day_key > lastDayKey ? sorted[sorted.length - 1] : null

  const weightMap = new Map(sorted.filter(w => w.day_key >= firstDayKey && w.day_key <= lastDayKey).map(w => [w.day_key, w.weight]))
  const inner: { x: number; y: number; weight: number }[] = []
  days.forEach((day, index) => {
    const w = weightMap.get(day.dayKey)
    if (w != null) {
      inner.push({ x: ((index + 0.5) / n) * 100, y: 0, weight: w })
    }
  })
  // 窗口内一个体重都没有时不画线（没有可连的节点）
  if (!inner.length) return { inner, line: '' }

  const mapY = (weight: number) => {
    const target = dietConfig.value.targetWeight
    if (target != null) {
      const top = 100
      const bottom = target - 5
      return Math.max(0, Math.min(100, ((top - weight) / (top - bottom)) * 100))
    }
    // 刻度只由窗口内体重决定，延伸点只做映射并截断在图内
    const values = inner.map(p => p.weight)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 0.5)
    return Math.max(0, Math.min(100, 10 + ((max - weight) / span) * 80))
  }
  inner.forEach(p => {
    p.y = mapY(p.weight)
  })

  const linePoints = [...inner]
  const dayDiff = (fromKey: string, toKey: string) =>
    Math.round((dayKeyToDate(toKey).getTime() - dayKeyToDate(fromKey).getTime()) / 86400000)
  if (before) {
    // 比 firstDayKey 早 k 天 → 槽位 index = -k，x 为负，画到左边界外被 svg 裁掉
    const k = dayDiff(before.day_key, firstDayKey)
    linePoints.unshift({ x: ((0.5 - k) / n) * 100, y: mapY(before.weight), weight: before.weight })
  }
  if (after) {
    // 比 lastDayKey 晚 k 天 → 槽位 index = n - 1 + k
    const k = dayDiff(lastDayKey, after.day_key)
    linePoints.push({ x: ((n - 0.5 + k) / n) * 100, y: mapY(after.weight), weight: after.weight })
  }
  const line = linePoints.length >= 2 ? linePoints.map(p => `${p.x},${p.y}`).join(' ') : ''
  return { inner, line }
})

/** 窗口内节点（画空心圆） */
const weightPoints = computed(() => weightChart.value.inner)

const weightPolyline = computed(() => weightChart.value.line)

// 目标体重参考线（与折线同一纵轴刻度）。折线/节点用的是距顶部百分比，这里要换成 CSS bottom 百分比
const targetWeightLineBottom = computed(() => {
  const target = dietConfig.value.targetWeight
  if (target == null) return null
  const top = 100
  const bottom = target - 5
  return Math.max(0, Math.min(100, ((target - bottom) / (top - bottom)) * 100))
})

const updateMonth = (value: string | number | null) => {
  if (typeof value === 'string' && value) {
    selectedMonth.value = value
    return
  }
  selectedMonth.value = null
}

const updateCaloriesUnit = (value: number | string | null) => {
  if (value === '%' || value === 'kCal' || value === 'kJ') {
    // 单位只是标注用户填的数值，切换不做换算
    recordModal.caloriesUnit = value
  }
}

watch(selectedMonth, () => {
  void loadSummary()
})

onMounted(async () => {
  await userStore.getUserInfo()
  void loadSummary()
})
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="page-head">
        <Btn v-if="isAdmin" class="settings-btn" small @click="openSettingsModal">设置</Btn>
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
            <div v-if="targetWeightLineBottom != null" class="target-weight-line" :style="{ bottom: `${targetWeightLineBottom}%` }"></div>
            <button v-for="day in chartBars" :key="day.dayKey" class="bar-item" :class="{ active: day.dayKey === selectedDayKey }" @click="selectDay(day.dayKey)">
              <div class="bar-track">
                <div class="bar-outline" :style="{ height: `${day.barHeight + day.negativeHeight}%` }"></div>
                <div class="bar-fill" :style="{ height: `${day.barHeight}%`, background: day.barColor }"></div>
                <div v-if="day.hasNegative" class="bar-fill-negative" :style="{ height: `${day.negativeHeight}%`, bottom: `${day.barHeight}%`, background: day.barColor, opacity: 0.5 }"></div>
              </div>
            </button>
            <svg v-if="weightPolyline" class="weight-line" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline :points="weightPolyline" />
            </svg>
            <div v-for="(point, index) in weightPoints" :key="index" class="weight-dot" :style="{ left: `${point.x}%`, top: `${point.y}%` }"></div>
          </div>
        </div>
      </Card>

      <Card v-if="isAdmin" class="today-card">
        <div class="card-head">
          <div class="card-title">{{ selectedDayLabel }}</div>
          <Btn small class="prev-day-btn" @click="selectDay(prevDayKey(selectedDayKey))">前一天</Btn>
          <Btn v-if="selectedDayKey !== currentDayKey()" small @click="selectDay(currentDayKey())">回到今天</Btn>
          <div class="card-sub">{{ Math.round(selectedDayTotalCalories) }} / {{ dietConfig.standardCalories }} kcal</div>
        </div>

        <div class="today-weight-row">
          <div class="today-weight-label">体重</div>
          <Input
            class="weight-input"
            v-model="weightInput"
            type="number"
            step="0.1"
            min="0"
            inputmode="decimal"
            placeholder=""
            @enter="commitWeight"
            @blur="scheduleWeightCommit"
            @clear="onWeightInputClear"
          />
          <span class="today-weight-unit">kg</span>
        </div>

        <div class="today-items" v-if="selectedDayRecords.length">
          <div v-for="record in selectedDayRecords" :key="record._id" class="today-item">
            <div class="today-item-fill" :style="getTodayItemFillStyle(record)"></div>
            <div class="today-item-row">
              <div class="today-item-name">{{ record.food_name }}{{ record.quantity != null && record.quantity !== 1 ? 'x' + formatDietNumber(record.quantity) : '' }}</div>
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

      <div v-if="recordModal.show" class="modal-mask">
        <Card class="modal">
          <div class="modal-head">
            <div class="modal-title">记录热量</div>
            <div v-if="!selectedRecordDayIsToday" class="modal-title-date">{{ selectedRecordDayLabel }}</div>
          </div>

          <template v-if="recordModal.stage === 1">
            <div class="search-row">
              <div class="search-input-wrap">
                <Input v-model="recordModal.query" placeholder="输入食物名称" @enter="confirmFood" />
                <CircleBtn
                  v-if="recordModal.query"
                  class="search-clear-btn"
                  icon="close"
                  :size="18"
                  :font-size="11"
                  aria-label="清除"
                  @click="recordModal.query = ''"
                />
              </div>
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

            <div class="modal-actions">
              <Btn @click="closeRecordModal">取消</Btn>
            </div>
          </template>

          <template v-else>
            <div class="selected-food-wrap">
              <div class="selected-food">
                <div class="selected-food-name">{{ recordModal.name }}</div>
              </div>
              <div class="selected-food-qty">
                <span class="selected-food-qty-label">数量</span>
                <Input class="quantity-input" v-model="recordModal.quantityValue" type="number" min="1" step="1" :placeholder="recordModal.quantityPlaceholder || '1'" />
              </div>
            </div>

            <div class="field-group">
              <div class="field-label">输入热量</div>
              <div class="field-row">
                <div class="search-input-wrap">
                  <Input class="value-input" v-model="recordModal.caloriesValue" type="number" step="0.1" :placeholder="recordModal.caloriesPlaceholder || recordModal.caloriesUnit" />
                  <CircleBtn v-if="recordModal.caloriesValue" class="search-clear-btn" icon="close" :size="18" :font-size="11" aria-label="清除" @click="recordModal.caloriesValue = ''" />
                </div>
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
                <Input class="unit-multiplier-input" v-model="recordModal.caloriesMultiplier" type="number" min="1" step="1" :placeholder="recordModal.multiplierPlaceholder || '100'" />
                <span class="unit-text">u</span>
              </div>
            </div>

            <div class="field-group">
              <div class="field-label">输入分量</div>
              <div class="field-row">
                <div class="search-input-wrap">
                  <Input class="value-input" v-model="recordModal.amountValue" type="number" min="1" step="1" :placeholder="recordModal.amountPlaceholder || '100'" />
                  <CircleBtn v-if="recordModal.amountValue" class="search-clear-btn" icon="close" :size="18" :font-size="11" aria-label="清除" @click="recordModal.amountValue = ''" />
                </div>
                <span class="unit-text">u</span>
              </div>
            </div>

            <div class="record-preview">
              预计总热量：{{ Math.round(getRecordTotalCalories()) }} kcal
            </div>

            <div class="modal-actions">
              <Btn @click="closeRecordModal">取消</Btn>
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
            <div class="field-label">目标体重（kg）</div>
            <Input v-model="settingsModal.targetWeight" type="number" min="1" step="0.1" placeholder="未设置" />
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

.modal {
  border-radius: 0.9rem;
}

.summary-head,
.card-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.card-head {
  justify-content: flex-start;
  flex-wrap: nowrap;
}

.card-sub {
  flex: 1 0 auto;
  text-align: right;
  white-space: nowrap;
}

.summary-head {
  justify-content: flex-start;
}

.prev-day-btn,
.back-today-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.summary-weight-change {
  flex: 1 0 auto;
  text-align: right;
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

// 每日标准线：与柱子超标的红色一致
.threshold-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: repeating-linear-gradient(90deg, rgba(255, 77, 79, 0.8) 0 2px, transparent 2px 4px);
  pointer-events: none;
  z-index: 3;
}

.chart-bars {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: end;
  width: 100%;
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
  /* 每天占一等分槽位，4px 柱体居中，间距随容器宽度自适应 */
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  justify-content: center;
}

// 选中态光圈画在 bar-outline 上，高度 = 正值段 + 负值段，包住完整柱子
.bar-outline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: none;
  border-radius: 999px 999px 0.2rem 0.2rem;
  pointer-events: none;
}

.bar-item.active .bar-outline {
  display: block;
  box-shadow: 0 0 0 2px rgba(66, 185, 131, 0.25), 0 6px 18px rgba(0, 0, 0, 0.12);
}

.bar-track {
  width: 4px;
  height: 100%;
  display: flex;
  align-items: end;
  position: relative;
}

.bar-fill {
  width: 4px;
  border-radius: 999px 999px 0.2rem 0.2rem;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  position: relative;
  z-index: 1;
}

.bar-fill-negative {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 0.2rem 0.2rem 0 0;
  z-index: 2;
}

.weight-line {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 4;

  polyline {
    fill: none;
    stroke: var(--primary-color, #42b983);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
}

.weight-dot {
  position: absolute;
  width: 7px;
  height: 7px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  box-sizing: border-box;
  background: transparent;
  border: 1.5px solid #000;
  pointer-events: none;
  z-index: 5;
}

// 暗色模式下用浅色描边，避免和深色背景融在一起
:global(:root.dark .weight-dot) {
  border-color: rgba(255, 255, 255, 0.85);
}

// 目标体重线：与体重折线同色，虚线密度与每日标准线一致
.target-weight-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: repeating-linear-gradient(90deg, var(--primary-color, #42b983) 0 2px, transparent 2px 4px);
  pointer-events: none;
  z-index: 3;
}

.today-weight-row {
  margin-top: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .today-weight-label {
    color: var(--text-secondary);
    font-size: 12px;
    flex: none;
  }

  .weight-input {
    width: 110px;

    // :deep(.input) {
    //   padding: 0.35rem 0.6rem;
    //   font-size: 13px;
    // }
  }

  .today-weight-unit {
    color: var(--text-secondary);
    font-size: 12px;
    flex: none;
  }
}

.today-items {
  margin-top: 0.75rem;
  display: grid;
  gap: 0.5rem;
}

.today-item {
  position: relative;
  overflow: hidden;
  padding: 0.6rem 0.7rem;
  border-radius: 0.75rem;
  background: var(--bg);
}

.today-item-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: inherit;
  opacity: 0.16;
  pointer-events: none;
}

.today-item-row {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
}

.today-item-name {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  text-align: left;
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
}

.search-input-wrap {
  position: relative;
  flex: 1 1 auto;
}

.search-clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
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
    display: flex;
  }

  .summary-head,
  .card-head {
    gap: 0.5rem;
  }

  .chart-bars {
    height: 96px;
  }

  .selected-food-wrap {
    align-items: stretch;
  }
}
</style>