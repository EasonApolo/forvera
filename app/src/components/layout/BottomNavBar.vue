<script setup lang="ts">
type NavItem = {
  key: string
  label: string
  active?: boolean
}

defineProps<{
  items: NavItem[]
}>()

const emit = defineEmits<{
  (e: 'select', key: string): void
}>()
</script>

<template>
  <div class="nav">
    <div
      class="nav-item"
      v-for="item in items"
      :key="item.key"
      :class="{ active: item.active }"
      @click="emit('select', item.key)"
    >
      <slot :name="`item-${item.key}`" :item="item">
        {{ item.label }}
      </slot>
    </div>
  </div>
</template>

<style lang="less" scoped>
.nav {
  position: fixed;
  margin: 0 auto;
  left: 0;
  right: 0;
  width: fit-content;
  bottom: 2rem;
  display: flex;
  align-items: center;
  justify-content: space-around;
  font-size: 15px;
  border-radius: 0.5rem;
  background-color: var(--card-bg);
  box-shadow: 0px 2px 8px 0px var(--nav-shadow);
  transition: background-color 0.25s ease;
  z-index: 2;
  column-gap: 12px;
  padding: 0 12px;

  .nav-item {
    position: relative;
    width: auto;
    min-height: 2rem;
    min-width: 2.5rem;
    padding: 0.375rem 0;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: 0.2rem;
    color: var(--text-secondary);
    transition: color 0.2s ease;
    cursor: pointer;
    user-select: none;
    text-align: center;
    white-space: nowrap;
  }

  .active {
    color: var(--accent-color) !important;
  }
}
</style>
