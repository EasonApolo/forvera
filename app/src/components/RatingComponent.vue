<script setup lang="ts">
import { ref, watch } from 'vue'

const { value, readonly = false } = defineProps<{
  value: number | null
  readonly?: boolean
}>()

const emit = defineEmits(['update:value'])

const rating = ref(value)

watch(
  () => value,
  newValue => {
    rating.value = newValue
  }
)

const setRating = (newRating: number) => {
  if (!readonly) {
    rating.value = newRating
    emit('update:value', newRating)
  }
}

const clearRating = () => {
  if (!readonly) {
    rating.value = null
    emit('update:value', null)
  }
}
</script>

<template>
  <div class="rating">
    <span
      v-for="n in 5"
      :key="n"
      :class="{
        filled: rating !== null && n <= rating,
        empty: rating === null,
      }"
      @click="setRating(n)"
      @dblclick="clearRating"
    >
      {{ rating === null || n > rating ? '☆' : '★' }}
    </span>
  </div>
</template>

<style scoped>
.rating {
  display: flex;
  cursor: pointer;
  user-select: none;
  height: 1rem;
  line-height: 1rem;
}

.rating span {
  font-size: 1rem;
  margin-right: 0.1875rem;
}

.rating span.filled {
  color: gold;
}

.rating span.empty {
  color: #aaa;
}
</style>
