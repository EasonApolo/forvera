<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import SortableList from '../components/SortableList.vue'

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

const cards = computed(() => cardOrder.value.map(key => cardMap.find(card => card.key === key)).filter(Boolean))

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

// 排序完成：按新顺序回写 key 列表并持久化
const onSortConfirm = (ordered: PlaygroundCard[]) => {
  cardOrder.value = ordered.map(card => card.key)
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
      <SortableList
        :model-value="cards"
        item-key="key"
        :enabled="userStore.isLogin"
        sort-text="排序"
        done-text="完成排序"
        @confirm="onSortConfirm"
      >
        <template #default="{ item: card, sortMode }">
          <Card
            v-if="card.type !== 'group'"
            class="entry"
            @click="!sortMode && onClickCard(card)"
          >
            <span>{{ card.title }}</span>
          </Card>

          <div v-else class="entry group">
            <div class="group-title">{{ card.title }}</div>
            <Card
              v-for="subCard in card.content"
              :key="subCard.content"
              class="group-entry"
              @click="!sortMode && onClickCard(subCard)"
            >
              <span>{{ subCard.title }}</span>
            </Card>
          </div>
        </template>
      </SortableList>
    </template>
  </List>
</template>

<style lang="less" scoped>
a {
  text-decoration: none;
  color: inherit;
}

.entry {
  cursor: pointer;
  line-height: 16px;
  font-size: 14px;
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
</style>
