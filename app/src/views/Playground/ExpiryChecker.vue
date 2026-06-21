<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import List from '@/components/layout/List.vue'
import Btn from '@/components/Btn.vue'
import Checkbox from '@/components/Checkbox.vue'
import Input from '@/components/Input.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import StepperFilter from '@/components/StepperFilter.vue'
import { useRouter } from 'vue-router'
import { useToastStore } from '@/store/toast'
import { request } from '@/utils/request'
import { debounce } from '@/utils/common'

type ShelfUnit = 'day' | 'week' | 'month' | 'year'

type ExpiryItem = {
  _id: string
  name: string
  mode?: 'shelf' | 'date'
  shelf_value?: number
  shelf_unit?: ShelfUnit
  completed?: boolean
  created_time: string
  expires_time: string
}

const router = useRouter()
const toastStore = useToastStore()

const items = ref<ExpiryItem[]>([])
const suggestions = ref<ExpiryItem[]>([])
const suggestionVisible = ref(false)
const showCompleted = ref(false)

const modal = reactive({
  show: false,
  editId: '',
  createdTime: '',
  name: '',
  mode: 'shelf' as 'shelf' | 'date',
  shelfValue: '',
  shelfUnitLabel: '天',
  dateInput: '',
})

const unitOptions: { label: string; value: ShelfUnit }[] = [
  { label: '天', value: 'day' },
  { label: '周', value: 'week' },
  { label: '月', value: 'month' },
  { label: '年', value: 'year' },
]

const unitLabels = unitOptions.map(item => item.label)

const navItems = [
  { key: 'back', label: '‹ 返回' },
  { key: 'add', label: '添加' },
]

const modeOptions = [
  { key: 'shelf', label: '保质时长' },
  { key: 'date', label: '过期日期' },
]

const getShelfUnit = (): ShelfUnit => {
  const matched = unitOptions.find(item => item.label === modal.shelfUnitLabel)
  return matched?.value || 'day'
}

const getShelfUnitLabel = (unit?: ShelfUnit) => {
  return unitOptions.find(item => item.value === unit)?.label || '天'
}

const loadItems = async () => {
  items.value = await request('expiry', 'GET', {
    include_completed: showCompleted.value ? '1' : '0',
  })
}

const searchSuggest = async (keyword: string) => {
  const trimmed = keyword.trim()
  if (!trimmed) {
    suggestions.value = []
    return
  }
  const result = await request('expiry/suggest', 'GET', { keyword: trimmed })
  if (modal.name.trim() !== trimmed) return
  const list = Array.isArray(result) ? result : []
  const seenNames = new Set<string>()
  suggestions.value = list.filter(item => {
    const key = `${item?.name || ''}`.trim()
    if (!key || seenNames.has(key)) return false
    seenNames.add(key)
    return true
  })
}

const debouncedSuggest = debounce((keyword: string) => {
  searchSuggest(keyword)
}, 250)

const onNameInput = (value: string | number) => {
  suggestionVisible.value = true
  debouncedSuggest(String(value ?? ''))
}

const addDurationToNow = (durationMs: number) => {
  const now = toDateStart(new Date())
  return new Date(now.getTime() + durationMs)
}

const applySuggestion = (item: ExpiryItem) => {
  modal.name = item.name
  const createdTime = new Date(item.created_time).getTime()
  const expiresTime = new Date(item.expires_time).getTime()
  const durationMs = Math.max(0, expiresTime - createdTime)

  if (item.mode === 'shelf' && item.shelf_value && item.shelf_unit) {
    modal.mode = 'shelf'
    modal.shelfValue = `${item.shelf_value}`
    modal.shelfUnitLabel = getShelfUnitLabel(item.shelf_unit)
    modal.dateInput = ''
  } else {
    modal.mode = 'date'
    modal.shelfValue = ''
    modal.shelfUnitLabel = '天'
    modal.dateInput = formatDate(addDurationToNow(durationMs))
  }

  suggestions.value = []
  suggestionVisible.value = false
}

const onNameFocus = () => {
  suggestionVisible.value = true
  debouncedSuggest(modal.name)
}

const onNameBlur = () => {
  setTimeout(() => {
    suggestionVisible.value = false
  }, 120)
}

const toDateStart = (date: Date) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

const addShelfLife = (start: Date, value: number, unit: ShelfUnit) => {
  const d = new Date(start)
  if (unit === 'day') {
    d.setTime(d.getTime() + value * 24 * 60 * 60 * 1000)
  }
  if (unit === 'week') {
    d.setTime(d.getTime() + value * 7 * 24 * 60 * 60 * 1000)
  }
  if (unit === 'month') {
    if (Number.isInteger(value)) d.setMonth(d.getMonth() + value)
    else d.setTime(d.getTime() + value * 30 * 24 * 60 * 60 * 1000)
  }
  if (unit === 'year') {
    if (Number.isInteger(value)) d.setFullYear(d.getFullYear() + value)
    else d.setTime(d.getTime() + value * 365 * 24 * 60 * 60 * 1000)
  }
  return d
}

const parseDateInput = (rawInput: string): Date | null => {
  const raw = rawInput.trim()
  if (!raw) return null

  const now = new Date()
  const currentYear = now.getFullYear()

  const buildDate = (year: number, month: number, day: number) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const d = new Date(year, month - 1, day)
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day
    ) {
      return null
    }
    d.setHours(0, 0, 0, 0)
    return d
  }

  if (raw.includes('.')) {
    const parts = raw.split('.').filter(Boolean)
    if (parts.length === 2) {
      const month = Number(parts[0])
      const day = Number(parts[1])
      return buildDate(currentYear, month, day)
    }
    if (parts.length === 3) {
      let year = Number(parts[0])
      if (parts[0].length === 2) year += 2000
      const month = Number(parts[1])
      const day = Number(parts[2])
      return buildDate(year, month, day)
    }
    return null
  }

  const digits = raw.replace(/\D/g, '')
  if (!digits) return null

  if (digits.length === 8) {
    const year = Number(digits.slice(0, 4))
    const month = Number(digits.slice(4, 6))
    const day = Number(digits.slice(6, 8))
    return buildDate(year, month, day)
  }
  if (digits.length === 6) {
    const year = 2000 + Number(digits.slice(0, 2))
    const month = Number(digits.slice(2, 4))
    const day = Number(digits.slice(4, 6))
    return buildDate(year, month, day)
  }
  if (digits.length === 4) {
    const month = Number(digits.slice(0, 2))
    const day = Number(digits.slice(2, 4))
    return buildDate(currentYear, month, day)
  }
  if (digits.length === 3) {
    const month = Number(digits.slice(0, 1))
    const day = Number(digits.slice(1, 3))
    return buildDate(currentYear, month, day)
  }

  return null
}

const formatDate = (value: string | Date) => {
  const d = typeof value === 'string' ? new Date(value) : value
  const year = d.getFullYear()
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${year}.${month}.${day}`
}

const getFreshness = (item: ExpiryItem) => {
  const today = toDateStart(new Date())
  const created = toDateStart(new Date(item.created_time)).getTime()
  const expires = toDateStart(new Date(item.expires_time)).getTime()
  const now = today.getTime()

  if (now > expires) {
    return { expired: true, ratio: 0 }
  }

  if (now === expires) {
    return { expired: false, ratio: 0.01 }
  }

  const total = Math.max(1, expires - created)
  const remain = Math.max(0, expires - now)
  const ratio = Math.max(0.01, Math.max(0, Math.min(1, remain / total)))
  return {
    expired: false,
    ratio,
  }
}

const toEntryList = (source: ExpiryItem[]) => {
  return source
    .map(item => ({ item, freshness: getFreshness(item) }))
    .sort((a, b) => {
      if (a.freshness.expired !== b.freshness.expired) {
        return a.freshness.expired ? -1 : 1
      }
      return a.freshness.ratio - b.freshness.ratio
    })
}

const pendingItems = computed(() => toEntryList(items.value.filter(item => !item.completed)))
const completedItems = computed(() => toEntryList(items.value.filter(item => !!item.completed)))

const getRowStyle = (ratio: number, expired: boolean, completed: boolean) => {
  if (completed) {
    return {
      backgroundColor: 'var(--btn-bg)',
      color: 'var(--text-secondary)',
    }
  }

  if (expired) {
    return {
      backgroundColor: 'rgb(0,0,0)',
      color: 'rgb(255,255,255)',
    }
  }

  const safeRatio = Math.max(0, Math.min(1, ratio))
  const gray = Math.round(255 * safeRatio)

  let textGray = 0
  if (safeRatio <= 0.5) {
    const t = safeRatio / 0.5
    textGray = Math.round(255 - (255 - 204) * t)
  } else {
    const t = (safeRatio - 0.5) / 0.5
    textGray = Math.round(51 * (1 - t))
  }

  return {
    backgroundColor: `rgb(${gray}, ${gray}, ${gray})`,
    color: `rgb(${textGray}, ${textGray}, ${textGray})`,
  }
}

const openModal = () => {
  modal.show = true
  modal.editId = ''
  modal.createdTime = ''
  modal.name = ''
  modal.mode = 'shelf'
  modal.shelfValue = ''
  modal.shelfUnitLabel = '天'
  modal.dateInput = ''
  suggestions.value = []
  suggestionVisible.value = false
}

const openEditModal = (item: ExpiryItem) => {
  modal.show = true
  modal.editId = item._id
  modal.createdTime = item.created_time
  modal.name = item.name
  if (item.mode === 'shelf' && item.shelf_value && item.shelf_unit) {
    modal.mode = 'shelf'
    modal.shelfValue = `${item.shelf_value}`
    modal.shelfUnitLabel = getShelfUnitLabel(item.shelf_unit)
    modal.dateInput = ''
  } else {
    modal.mode = 'date'
    modal.shelfValue = ''
    modal.shelfUnitLabel = '天'
    modal.dateInput = formatDate(item.expires_time)
  }
  suggestions.value = []
  suggestionVisible.value = false
}

const closeModal = () => {
  modal.show = false
  suggestions.value = []
  suggestionVisible.value = false
}

const removeEditingItem = async () => {
  if (!modal.editId) return
  if (!confirm(`确认删除「${modal.name}」吗？`)) return
  await request(`expiry/${modal.editId}`, 'DELETE')
  await loadItems()
  closeModal()
}

const completeItem = async (item: ExpiryItem) => {
    await request(`expiry/${item._id}`, 'PUT', {
    completed: !item.completed,
  })
  await loadItems()
}

const toggleShowCompleted = async () => {
  showCompleted.value = !showCompleted.value
  await loadItems()
}

const submit = async () => {
  const name = modal.name.trim()
  if (!name) {
    toastStore.showToast({ content: '请填写名称', type: '!' })
    return
  }

  const created = toDateStart(new Date())
  let expires: Date | null = null

  if (modal.mode === 'shelf') {
    const value = Number(modal.shelfValue)
    if (!Number.isFinite(value) || value <= 0) {
      toastStore.showToast({ content: '保质期请输入大于 0 的数字', type: '!' })
      return
    }
    expires = addShelfLife(created, value, getShelfUnit())
  } else {
    expires = parseDateInput(modal.dateInput)
    if (!expires) {
      toastStore.showToast({ content: '日期格式不正确', type: '!' })
      return
    }
  }

  if (modal.editId) {
    await request(`expiry/${modal.editId}`, 'PUT', {
      name,
      expires_time: expires.toISOString(),
      mode: modal.mode,
      shelf_value: modal.mode === 'shelf' ? Number(modal.shelfValue) : undefined,
      shelf_unit: modal.mode === 'shelf' ? getShelfUnit() : undefined,
    })
  } else {
    await request('expiry', 'POST', {
      name,
      expires_time: expires.toISOString(),
      mode: modal.mode,
      shelf_value: modal.mode === 'shelf' ? Number(modal.shelfValue) : undefined,
      shelf_unit: modal.mode === 'shelf' ? getShelfUnit() : undefined,
      completed: false,
    })
  }

  await loadItems()
  closeModal()
}

onMounted(() => {
  void loadItems()
})

const handleNavSelect = (key: string) => {
  if (key === 'back') {
    router.push({ name: 'playground' })
    return
  }
  if (key === 'add') {
    openModal()
  }
}
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="page-title-row">
        <div class="page-title">什么时候过期？</div>
        <Btn small @click="toggleShowCompleted">{{ showCompleted ? '隐藏完成' : '显示完成' }}</Btn>
      </div>

      <div class="items">
        <div v-if="!pendingItems.length && !completedItems.length" class="empty">暂无物品，点击 + 添加</div>
        <div
          v-for="entry in pendingItems"
          :key="entry.item._id"
          class="item-row"
          :style="getRowStyle(entry.freshness.ratio, entry.freshness.expired, !!entry.item.completed)"
          @click="openEditModal(entry.item)"
        >
          <div class="left">
            <div class="name">{{ entry.item.name }}</div>
            <div class="meta">截止时间：{{ formatDate(entry.item.expires_time) }}</div>
          </div>
          <div class="right">
            <div class="freshness">
              <template v-if="entry.item.completed">已完成</template>
              <template v-else-if="entry.freshness.expired">已过期</template>
              <template v-else>新鲜度 {{ Math.round(entry.freshness.ratio * 100) }}%</template>
            </div>
            <Checkbox :model-value="!!entry.item.completed" @update:modelValue="completeItem(entry.item)" />
          </div>
        </div>

        <div
          v-if="showCompleted && completedItems.length"
          class="completed-divider"
        >
          已完成的项
        </div>

        <div
          v-for="entry in (showCompleted ? completedItems : [])"
          :key="entry.item._id"
          class="item-row"
          :style="getRowStyle(entry.freshness.ratio, entry.freshness.expired, !!entry.item.completed)"
          @click="openEditModal(entry.item)"
        >
          <div class="left">
            <div class="name">{{ entry.item.name }}</div>
            <div class="meta">截止时间：{{ formatDate(entry.item.expires_time) }}</div>
          </div>
          <div class="right">
            <div class="freshness">已完成</div>
            <Checkbox :model-value="!!entry.item.completed" @update:modelValue="completeItem(entry.item)" />
          </div>
        </div>
      </div>

      <div v-if="modal.show" class="mask" @click.self="closeModal">
        <div class="modal">
          <div class="title">{{ modal.editId ? '编辑' : '添加' }}</div>

          <div v-if="modal.editId" class="created-time">
            创建日期：{{ formatDate(modal.createdTime) }}
          </div>

          <div class="field">
            <div class="label">名称</div>
            <div class="name-suggest">
              <Input
                v-model="modal.name"
                placeholder="例如：牛奶"
                @update:modelValue="onNameInput"
                @focus="onNameFocus"
                @blur="onNameBlur"
              />
              <div
                v-if="suggestionVisible && suggestions.length"
                class="suggest-panel"
              >
                <div
                  v-for="item in suggestions"
                  :key="item._id"
                  class="suggest-item"
                  @mousedown.prevent="applySuggestion(item)"
                >
                  <div class="suggest-name">{{ item.name }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="field">
            <div class="label">过期时间</div>
            <div class="mode-radio">
              <Btn
                v-for="option in modeOptions"
                :key="option.key"
                :type="modal.mode === option.key ? 'primary' : undefined"
                @click="modal.mode = option.key as 'shelf' | 'date'"
              >
                {{ option.label }}
              </Btn>
            </div>
          </div>

          <div class="field" v-if="modal.mode === 'shelf'">
            <div class="label">保质时长</div>
            <div class="shelf-row">
              <Input
                class="number"
                v-model="modal.shelfValue"
                type="number"
                min="0"
                step="any"
                placeholder="数字"
              />
              <StepperFilter
                class="unit-stepper"
                :value="modal.shelfUnitLabel"
                :options="unitLabels"
                nullable-position="min"
                @update:value="val => (modal.shelfUnitLabel = typeof val === 'string' ? val : '天')"
              />
            </div>
          </div>

          <div class="field" v-else>
            <div class="label">过期日期</div>
            <Input
              v-model="modal.dateInput"
              placeholder="260324 / 0324 / 3.24 / 2026.03.24"
            />
          </div>

          <div class="actions">
            <Btn v-if="modal.editId" type="danger" @click="removeEditingItem">删除</Btn>
            <Btn @click="closeModal">取消</Btn>
            <Btn type="primary" @click="submit">{{ modal.editId ? '保存' : '添加' }}</Btn>
          </div>
        </div>
      </div>

      <BottomNavBar :items="navItems" @select="handleNavSelect" />
    </template>
  </List>
</template>

<style lang="less" scoped>
.page-title-row {
  padding: 0 4px;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  text-align: left;
  font-size: 14px;
  font-weight: 700;
}

.items {
  margin-bottom: 4.5rem;
  padding: 0 4px;

  .empty {
    text-align: left;
    color: var(--text-secondary);
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 8px;
    padding: 0.6rem 0.7rem;
    cursor: pointer;

    &:not(:first-child) {
      margin-top: 0.5rem;
    }

    .left {
      text-align: left;
      justify-content: flex-start;

      .name {
        font-size: 14px;
        font-weight: 700;
      }

      .meta {
        margin-top: 2px;
        font-size: 12px;
      }
    }

    .right {
      flex: 0 0 auto;
      margin-left: 0.75rem;
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      column-gap: 0.5rem;

      .freshness {
        white-space: nowrap;
      }
    }
  }

  .completed-divider {
    margin: 0.6rem 0 0.3rem;
    text-align: left;
    color: var(--text-secondary);
    font-size: 12px;
  }
}

.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 140;

  .modal {
    width: min(28rem, calc(100vw - 1rem));
    margin: 0.5rem;
    border-radius: 0.5rem;
    background-color: var(--card-bg);
    padding: 0.75rem;

    .title {
      text-align: left;
      font-size: 16px;
      font-weight: 700;
    }

    .created-time {
      margin-top: 0.35rem;
      text-align: left;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .field {
      margin-top: 0.6rem;

      .label {
        text-align: left;
        font-size: 12px;
        color: var(--text-secondary);
        margin-bottom: 0.3rem;
      }

      .mode-radio {
        display: flex;
        align-items: center;
        column-gap: 0.35rem;

        :deep(.label.active) {
          color: #fff;
        }
      }

      .name-suggest {
        position: relative;

        .suggest-panel {
          position: absolute;
          left: 0;
          top: calc(100% + 0.3rem);
          width: 100%;
          max-height: 12rem;
          overflow-y: auto;
          border: 1px solid var(--border-light);
          border-radius: 0.35rem;
          background: var(--card-bg);
          z-index: 5;
        }

        .suggest-item {
          padding: 0.4rem 0.5rem;
          text-align: left;
          cursor: pointer;

          &:hover {
            background: var(--bg);
          }

          .suggest-name {
            font-size: 13px;
            font-weight: 600;
          }
        }
      }

      .shelf-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        .number {
          width: 7rem;
        }

        .unit-stepper {
          width: 180px;
        }
      }
    }

    .actions {
      margin-top: 0.75rem;
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;

      > * {
        flex: 0 0 auto;
      }
    }
  }
}
</style>
