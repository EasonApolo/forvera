<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import CircleBtn from '../components/CircleBtn.vue'
import List from '../components/layout/List.vue'

const router = useRouter()
const userStore = useUserStore()
const defaultCardOrder = [
  'taxonomy',
  'requirements',
  'diet',
  'stock',
  'holdem',
  'gomoku',
  'drawguess',
  'game',
  'village',
  'pet',
  'rating',
  'mihoyo',
]

type Card = {
  key: string
  type: 'route' | 'href'
  title: string
  content: string
}
type Group = {
  key: string
  type: 'group'
  title: string
  content: Card[]
}
type PlaygroundCard = Card | Group

const cardMap: PlaygroundCard[] = [
  { key: 'taxonomy', type: 'route', title: '🌳Taxonomy', content: 'taxonomy' },
  {
    key: 'requirements',
    type: 'route',
    title: '🧩需求拆解',
    content: 'requirements',
  },
  { key: 'diet', type: 'route', title: '🍽Diet', content: 'diet' },
  {
    key: 'underConstruction',
    type: 'group',
    title: '🚧施工中',
    content: [
      { key: 'stock', type: 'route', title: '股市', content: 'stock' },
      { key: 'village', type: 'route', title: '🏘Village', content: 'village' },
      { key: 'pet', type: 'route', title: 'AGENT', content: 'pet' },
    ],
  },
  {
    key: 'games',
    type: 'group',
    title: 'Games',
    content: [
      { key: 'holdem', type: 'route', title: '🃏德扑', content: 'holdem' },
      { key: 'gomoku', type: 'route', title: '棋牌室', content: 'gomoku' },
      { key: 'game', type: 'route', title: '你画我猜', content: 'game' },
    ],
  },
  { key: 'rating', type: 'route', title: '⭐Rating', content: 'rating' },
  {
    key: 'mihoyo',
    type: 'group',
    title: '云游戏',
    content: [
      { key: 'ys', type: 'href', title: '原神启动', content: 'https://ys.mihoyo.com/cloud/#/' },
      { key: 'sr', type: 'href', title: '崩铁启动', content: 'https://sr.mihoyo.com/cloud/#/' },
    ],
  },
  {
    key: 'agents',
    type: 'group',
    title: 'Agents',
    content: [
      { key: 'dictionary', type: 'route', title: '查词', content: 'dictionary' },
    ],
  },
]

const cardOrder = ref<string[]>([...defaultCardOrder])
const sortMode = ref(false)

const cards = computed(() => cardOrder.value.map(key => cardMap.find(card => card.key === key)).filter(Boolean))

const toggleSortMode = () => {
  sortMode.value = !sortMode.value
}

const sameArray = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

const normalizeSortOrder = (saved?: string[]) => {
  const validKeys = new Set(cardMap.map(card => card.key))
  const seen = new Set<string>()
  const merged: string[] = []

  if (Array.isArray(saved)) {
    for (const key of saved) {
      if (!validKeys.has(key) || seen.has(key)) continue
      merged.push(key)
      seen.add(key)
    }
  }

  for (const key of defaultCardOrder) {
    if (validKeys.has(key) && !seen.has(key)) {
      merged.push(key)
      seen.add(key)
    }
  }

  for (const card of cardMap) {
    if (!seen.has(card.key)) {
      merged.push(card.key)
      seen.add(card.key)
    }
  }

  return merged
}

const persistPlaygroundSort = async () => {
  if (!userStore.isLogin) return
  await userStore.updateSettings({ playgroundSort: cardOrder.value })
}

const moveCard = (index: number, direction: 'up' | 'down') => {
  const offset = direction === 'up' ? -1 : 1
  const targetIndex = index + offset
  if (targetIndex < 0 || targetIndex >= cardOrder.value.length) {
    return
  }
  const next = [...cardOrder.value]
  const [current] = next.splice(index, 1)
  next.splice(targetIndex, 0, current)
  cardOrder.value = next
  void persistPlaygroundSort()
}

// ==================== click card ====================
const onClickCard = (card: PlaygroundCard) => {
  if (card.type === 'route' && card.content) {
    router.push({ name: card.content })
  } else if (card.type === 'href' && card.content) {
    window.open(card.content, '_blank')
  }
}

watch(
  () => userStore.userInfo.settings?.playgroundSort,
  savedOrder => {
    const normalized = normalizeSortOrder(savedOrder)
    if (!sameArray(cardOrder.value, normalized)) {
      cardOrder.value = normalized
    }

    if (userStore.isLogin && Array.isArray(savedOrder) && !sameArray(savedOrder, normalized)) {
      void userStore.updateSettings({ playgroundSort: normalized })
    }
  },
  { immediate: true }
)
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="toolbar">
        <Btn v-if="userStore.isLogin" size="small" @click="toggleSortMode">{{
          sortMode ? '完成排序' : '排序'
        }}</Btn>
      </div>

      <div v-for="(card, index) in cards" :key="card.key" class="entry-row">
        <div class="entry-main">
          <Card v-if="card.type !== 'group'" class="entry" @click="onClickCard(card)">
            <span>{{ card.title }}</span>
          </Card>

          <div v-else class="entry group">
            <div class="group-title">{{ card.title }}</div>
            <Card
              v-for="subCard in card.content"
              :key="subCard.content"
              class="group-entry"
              @click="onClickCard(subCard)"
            >
              <span>{{ subCard.title }}</span>
            </Card>
          </div>
        </div>

        <div v-if="sortMode && userStore.isLogin" class="sort-controls">
          <CircleBtn
            icon="chevron-up"
            :size="18"
            :mobileSize="18"
            aria-label="move up"
            :class="{ disabled: index === 0 }"
            @click="moveCard(index, 'up')"
          />
          <CircleBtn
            icon="chevron-down"
            :size="18"
            :mobileSize="18"
            aria-label="move down"
            :class="{ disabled: index === cards.length - 1 }"
            @click="moveCard(index, 'down')"
          />
        </div>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
a {
  text-decoration: none;
  color: inherit;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.entry-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}

.entry-row + .entry-row {
  margin-top: 0.5rem;
}

.entry-main {
  flex: 1;
  min-width: 0;
}

.entry {
  cursor: pointer;
}

.group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;

  .card {
    margin-top: 0 !important;
    font-size: 14px;
  }

  .group-title {
    color: var(--text-secondary);
    font-size: 13px;
    margin: 0 0px 0 4px;
  }

  .group-entry {
    flex: 1 1 auto;
  }
}

.sort-controls {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.375rem;

  .disabled {
    pointer-events: none;
    opacity: 0.4;
  }
}
</style>
