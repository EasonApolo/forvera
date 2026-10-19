<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import Btn from '@/components/Btn.vue'
import { useToastStore } from '@/store/toast'
import {
  IHoldemRoom,
  IHoldemUser,
  HoldemCard,
  HoldemMsgTypes,
} from 'shared/types/games/holdem'
import PokerCard from './PokerCard.vue'

const { room, user, userId, socket } = defineProps<{
  room: IHoldemRoom
  user: IHoldemUser
  userId: string
  socket: any
}>()

const toastStore = useToastStore()

// 动作气泡数据由 HoldemMain 统一监听 socket 后 provide（playerBody 每个玩家一份，不能各自监听）
const userActions = inject<Record<string, { action: string; amount?: number; totalAmount?: number; timestamp: number }>>(
  'holdemUserActions',
  {},
)

const holdemRoom = computed(() => room as IHoldemRoom)

/** 银行余额（贷款为负、存款为正），0 = 与银行无往来不显示 */
const bankBalance = computed(() => user.bankBalance || 0)

const isHandEnd = computed(
  () => !!holdemRoom.value.winnerIds?.length && holdemRoom.value.currentPlayerId === '',
)
const isMyTurn = computed(
  () =>
    room.status === 'playing' &&
    room.roundStatus === 'ing' &&
    room.turnStatus === 'ing' &&
    holdemRoom.value.currentPlayerId === userId,
)

const getUserBetSum = (u: IHoldemUser) =>
  (u.betChips || []).reduce((sum, chip) => sum + chip.value * chip.count, 0)
const hasBetChips = (u: IHoldemUser) =>
  Array.isArray(u?.betChips) && u.betChips.some((chip) => chip.count > 0)
const hasNewBet = (u: IHoldemUser) => getUserBetSum(u) > (u.betSum || 0)

// ==================== 操作 ====================

const addChip = (chipValue: number) => socket.emit(HoldemMsgTypes.AddChip, { chipValue })
const removeChip = (chipValue: number) => socket.emit(HoldemMsgTypes.RemoveChip, { chipValue })
const confirmBet = () => socket.emit(HoldemMsgTypes.ConfirmBet, undefined)
const call = () => socket.emit(HoldemMsgTypes.Call, undefined)
const takeBackBetChips = () => socket.emit(HoldemMsgTypes.TakeBackBetChips, undefined)
const allIn = () => socket.emit(HoldemMsgTypes.AllIn, undefined)

/** 跟注还需补的筹码（0 = 无需跟注，不显示跟注按钮） */
const callAmount = computed(() => {
  const myBet = getUserBetSum(user)
  let maxBet = 0
  for (const id of holdemRoom.value.playerIds || []) {
    if (id === user.id) continue
    const other = room.users[id] as IHoldemUser | undefined
    if (!other) continue
    maxBet = Math.max(maxBet, getUserBetSum(other))
  }
  return Math.max(0, maxBet - myBet)
})

const quitBet = () => {
  // 与旧版一致：小盲/大盲首轮未补齐盲注不能弃牌
  if (
    (user.isSmallBlind && (user.betSum || 0) < 5) ||
    (user.isBigBlind && (user.betSum || 0) < 10)
  ) {
    toastStore.showToast({ content: '小盲和大盲在首轮不能弃牌', type: '!' })
    return
  }
  if (!window.confirm('确定要弃牌吗？')) return
  socket.emit(HoldemMsgTypes.QuitBet, undefined)
}

const showBank = ref(false)
const exchangeToSmallChips = () => socket.emit(HoldemMsgTypes.ExchangeToSmallChips, undefined)
const exchangeToLargeChips = () => socket.emit(HoldemMsgTypes.ExchangeToLargeChips, undefined)
const loan = () => socket.emit(HoldemMsgTypes.Loan, undefined)
const repay = () => socket.emit(HoldemMsgTypes.Repay, undefined)

// ==================== 手牌展示 ====================

/** 摊牌亮牌 > 自己的私有手牌 > 背面（在座未亮牌一律 2 张背面，与公共牌同组件） */
const CARD_BACK: HoldemCard = { rank: '2', suit: 'hearts', isFacedown: true }
const displayCards = computed((): { card: HoldemCard; facedown: boolean }[] => {
  const revealed = holdemRoom.value.revealedCards?.[user.id]
  if (Array.isArray(revealed) && revealed.length) {
    return revealed.map((card) => ({ card, facedown: false }))
  }
  if (user.id === userId && Array.isArray(user.cards) && user.cards.length) {
    return user.cards.map((card) => ({ card, facedown: false }))
  }
  if (
    (holdemRoom.value.playerIds || []).includes(user.id) &&
    holdemRoom.value.gamePhase !== 'showdown'
  ) {
    return [
      { card: CARD_BACK, facedown: true },
      { card: CARD_BACK, facedown: true },
    ]
  }
  return []
})

const getActionText = (action: string, amount?: number, totalAmount?: number) => {
  switch (action) {
    case 'fold':
      return '弃牌'
    case 'call':
      return '跟'
    case 'raise':
      return amount ? `加${amount}${totalAmount ? `，共${totalAmount}` : ''}` : '加'
    case 'all-in':
      return totalAmount ? `梭哈，共${totalAmount}` : '梭哈'
    default:
      return action
  }
}
</script>

<template>
  <div v-if="room.status === 'playing'" class="holdem-player-body">
    <!-- 动作气泡（HoldemMain 统一提供数据） -->
    <div v-if="userActions[user.id]" class="user-action-bubble">
      <div class="bubble-arrow"></div>
      <div class="bubble-content">
        {{
          getActionText(
            userActions[user.id].action,
            userActions[user.id].amount,
            userActions[user.id].totalAmount,
          )
        }}
      </div>
    </div>

    <!-- 筹码行：左侧手里的筹码（点 = 下注），右侧本回合下注区（点 = 拿回） -->
    <div class="chips-row">
      <div class="user-chips" v-if="user.chips">
        <div
          v-for="chip in user.chips"
          :key="chip.value"
          class="chip-item"
          :class="{ clickable: isMyTurn && user.id === userId && chip.count > 0 }"
          @click="isMyTurn && user.id === userId && chip.count > 0 && addChip(chip.value)"
        >
          <div class="chip-stack">
            <div v-for="i in chip.count" :key="i" class="chip" :class="`chip-value-${chip.value}`"></div>
          </div>
          <span class="chip-value">{{ chip.value }}</span>
        </div>
        <span
          v-if="bankBalance !== 0"
          class="bank-badge"
          :class="{ 'bank-loan': bankBalance < 0 }"
        >
          银行{{ bankBalance > 0 ? '+' : '' }}{{ bankBalance }}
        </span>
      </div>

      <div class="bet-chips" v-if="user.betChips">
        <div
          v-for="chip in user.betChips"
          :key="chip.value"
          class="chip-item"
          :class="{ clickable: isMyTurn && user.id === userId && chip.count > 0 }"
          @click="isMyTurn && user.id === userId && chip.count > 0 && removeChip(chip.value)"
        >
          <div class="chip-stack">
            <div v-for="i in chip.count" :key="i" class="chip" :class="`chip-value-${chip.value}`"></div>
          </div>
          <span class="chip-value">{{ chip.value }}</span>
        </div>
      </div>
    </div>

    <!-- 牌 + 我的操作按钮 -->
    <div v-if="displayCards.length" class="cards-action-row">
      <div class="user-cards">
        <div v-for="(item, index) in displayCards" :key="index" class="card-item">
          <PokerCard :card="item.card" :isFacedown="item.facedown" />
        </div>
      </div>

      <div v-if="user.id === userId && isMyTurn" class="action-button">
        <template v-if="showBank">
          <Btn small @click="showBank = false">返回</Btn>
          <div class="button-divider"></div>
          <Btn small @click="exchangeToSmallChips">找零</Btn>
          <Btn small @click="exchangeToLargeChips">化整</Btn>
          <div class="button-divider"></div>
          <Btn small @click="loan">贷款</Btn>
          <Btn small @click="repay">还款</Btn>
        </template>
        <template v-else>
          <Btn small @click="showBank = true">访问银行🏦</Btn>
          <div class="button-divider"></div>
          <Btn v-if="hasNewBet(user)" small @click="takeBackBetChips">拿回</Btn>
          <Btn v-if="callAmount > 0" small @click="call">跟注</Btn>
          <Btn small @click="allIn">梭哈</Btn>
          <div class="button-divider"></div>
          <Btn small type="danger" @click="quitBet">弃牌</Btn>
          <Btn small type="primary" @click="confirmBet">确认</Btn>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.holdem-player-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;

  .user-action-bubble {
    position: relative;
    display: inline-block;
    align-self: flex-start;

    .bubble-content {
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
    }

    .bubble-arrow {
      position: absolute;
      left: -4px;
      top: 50%;
      transform: translateY(-50%);
      width: 0;
      height: 0;
      border-top: 4px solid transparent;
      border-bottom: 4px solid transparent;
      border-right: 4px solid rgba(0, 0, 0, 0.8);
    }
  }

  .chips-row {
    display: flex;
    justify-content: space-between;
    align-items: end;
    width: 100%;
    margin: 4px 0 0;
  }

  .user-chips,
  .bet-chips {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: end;
  }

  .bank-badge {
    align-self: center;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: bold;
    line-height: 14px;
    color: white;
    background-color: #52c41a; // 存款：绿
    white-space: nowrap;

    &.bank-loan {
      background-color: #ff4d4f; // 贷款：红
    }
  }

  .chip-item {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    justify-content: end;
    cursor: pointer;
    transition: all 0.2s ease;
    gap: 2px;
  }

  .chip-stack {
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 1px;
  }

  .chip {
    height: 4px;
    border-radius: 2px;
    width: 16px;
    transition: all 0.2s ease;
  }

  .chip-value-5 {
    background-color: #ffd700;
  }
  .chip-value-10 {
    background-color: #00bfff;
  }
  .chip-value-20 {
    background-color: #32cd32;
  }
  .chip-value-50 {
    background-color: #ff6347;
  }
  .chip-value-100 {
    background-color: #9370db;
  }
  .chip-value-200 {
    background-color: #ff69b4;
  }

  .chip-item:hover .chip {
    transform: scaleY(1.2);
  }
  .chip-item.clickable:hover .chip {
    opacity: 0.8;
  }

  .chip-value {
    font-weight: bold;
    font-size: 10px;
    line-height: 10px;
  }

  .cards-action-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
  }

  .user-cards {
    display: flex;
    gap: 4px;
  }

  .card-item {
    perspective: 1000px;
  }

  .action-button {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .button-divider {
    width: 1px;
    height: 16px;
    margin: 0 2px;
    background-color: var(--border-light);
    align-self: center;
    flex-shrink: 0;
  }
}
</style>
