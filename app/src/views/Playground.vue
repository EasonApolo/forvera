<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../store/user'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import CircleBtn from '../components/CircleBtn.vue'
import List from '../components/layout/List.vue'
import { request } from '@/utils/request'

const router = useRouter()
const userStore = useUserStore()
const defaultCardOrder = ['taxonomy', 'requirements', 'expiry', 'diet', 'holdem', 'gomoku', 'pet', 'rating', 'mihoyo']

type PlaygroundCard =
  | { key: string; type: 'route'; title: string; routeName: string; soon?: string }
  | {
      key: string
      type: 'pair'
      links: { title: string; href: string }[]
    }

const cardMap: Record<string, PlaygroundCard> = {
  taxonomy: { key: 'taxonomy', type: 'route', title: '🌳Taxonomy', routeName: 'taxonomy' },
  requirements: { key: 'requirements', type: 'route', title: '🧩需求拆解', routeName: 'requirements' },
  expiry: { key: 'expiry', type: 'route', title: '🥛什么时候过期？', routeName: 'expiry' },
  diet: { key: 'diet', type: 'route', title: '🍽Diet', routeName: 'diet' },
  holdem: { key: 'holdem', type: 'route', title: '🃏德扑', routeName: 'holdem' },
  gomoku: { key: 'gomoku', type: 'route', title: '⚫五子棋', routeName: 'gomoku' },
  pet: { key: 'pet', type: 'route', title: 'AGENT', routeName: 'pet' },
  rating: { key: 'rating', type: 'route', title: '⭐Rating', routeName: 'rating' },
  mihoyo: {
    key: 'mihoyo',
    type: 'pair',
    links: [
      { title: '原神启动', href: 'https://ys.mihoyo.com/cloud/#/' },
      { title: '崩铁启动', href: 'https://sr.mihoyo.com/cloud/#/' },
    ],
  },
}

const cardOrder = ref<string[]>([...defaultCardOrder])
const sortMode = ref(false)
const expirySoonNames = ref<string[]>([])

const cards = computed(() =>
  cardOrder.value.map((key) => {
    const card = cardMap[key]
    if (key !== 'expiry' || card?.type !== 'route') return card
    const soon = expirySoonNames.value.length ? expirySoonNames.value.join('、') : ''
    return {
      ...card,
      title: card.title,
      soon,
    }
  }).filter(Boolean),
)

const goto = (routeName: string) => {
  router.push({ name: routeName })
}

const toggleSortMode = () => {
  sortMode.value = !sortMode.value
}

const sameArray = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}

const normalizeSortOrder = (saved?: string[]) => {
  const validKeys = new Set(Object.keys(cardMap))
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

  for (const key of Object.keys(cardMap)) {
    if (!seen.has(key)) {
      merged.push(key)
      seen.add(key)
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

const loadExpirySoonNames = async () => {
  if (!userStore.isLogin) {
    expirySoonNames.value = []
    return
  }

  const result = await request('expiry/soon', 'GET', { percent: '20' })
  const items = Array.isArray(result?.items) ? result.items : []
  expirySoonNames.value = items
    .map((item: { name?: string }) => `${item?.name || ''}`.trim())
    .filter(Boolean)
    .slice(0, 3)
}

onMounted(() => {
  void loadExpirySoonNames()
})

watch(
  () => userStore.userInfo.settings?.playgroundSort,
  (savedOrder) => {
    const normalized = normalizeSortOrder(savedOrder)
    if (!sameArray(cardOrder.value, normalized)) {
      cardOrder.value = normalized
    }

    if (userStore.isLogin && Array.isArray(savedOrder) && !sameArray(savedOrder, normalized)) {
      void userStore.updateSettings({ playgroundSort: normalized })
    }
  },
  { immediate: true },
)

watch(
  () => userStore.isLogin,
  () => {
    void loadExpirySoonNames()
  },
)
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="toolbar">
          <Btn v-if="userStore.isLogin" size="small" @click="toggleSortMode">{{ sortMode ? '完成排序' : '排序' }}</Btn>
      </div>

      <div v-for="(card, index) in cards" :key="card.key" class="entry-row">
        <div class="entry-main">
          <Card
            v-if="card.type === 'route'"
            class="entry"
            @click="goto(card.routeName)"
          >
            <span>
              {{ card.title }}
              <span v-if="card.soon" class="page-title-soon">（{{ card.soon }}）</span>
            </span>
          </Card>

          <div v-else class="entry pair-entry">
            <Card v-for="link in card.links" :key="link.href" class="pair-card">
              <a
                :href="link.href"
                target="_blank"
                class="pair-link"
              >
                {{ link.title }}
              </a>
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

.pair-entry {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;

  .card {
    margin-top: 0 !important;
  }

  .pair-card {
    cursor: pointer;
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

.page-title-soon {
  color: var(--text-secondary, #888);
  font-size: 0.85rem;
  margin-left: 0.25rem;
}

</style>
