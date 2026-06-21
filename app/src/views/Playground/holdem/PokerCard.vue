<script setup lang="ts">
defineProps<{
  card: {
    rank: string
    suit: string
  }
  isFacedown: boolean
}>()
</script>

<template>
  <div class="poker-card" :class="{ facedown: isFacedown }">
    <span v-if="!isFacedown" class="card-rank">{{ card.rank }}</span>
    <span v-if="!isFacedown" class="card-suit">
      <!-- 花色图片 -->
      <img v-if="card.suit === 'hearts'" class="suit-icon" :src="'/' + 'hearts.png'" alt="红心" />
      <img
        v-else-if="card.suit === 'diamonds'"
        class="suit-icon"
        :src="'/' + 'diamonds.png'"
        alt="方块"
      />
      <img
        v-else-if="card.suit === 'clubs'"
        class="suit-icon"
        :src="'/' + 'clubs.png'"
        alt="梅花"
      />
      <img
        v-else-if="card.suit === 'spades'"
        class="suit-icon"
        :src="'/' + 'spades.png'"
        alt="黑桃"
      />
    </span>
    <span v-else class="card-back">背面</span>
  </div>
</template>

<style lang="less" scoped>
.poker-card {
  width: 33px;
  height: 44px;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 14px;
  font-weight: bold;
  background-color: #fff;
  color: var(--card-font);
  transition: all 0.3s ease;
  &.facedown {
    background-color: #333;
    color: #fff;
  }
  .card-rank {
    font-size: 16px;
    line-height: 16px;
  }
  .card-suit {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card-back {
    font-size: 12px;
  }
  .suit-icon {
    width: 20px;
    height: 20px;
  }
}
</style>
