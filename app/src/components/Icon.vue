<script setup lang="ts">
const { type, size, clickable } = withDefaults(
  defineProps<{
    type: string
    size?: 'normal' | 'small' | 'large'
    clickable?: boolean
  }>(),
  { size: 'normal', clickable: true }
)
</script>

<template>
  <div :class="['icon', size, { clickable }]">{{ type }}</div>
</template>

<style scoped lang="less">
.icon {
  display: inline-block;
  text-align: center;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon.normal {
  font-size: 16px;
  width: 20px;
  height: 20px;
}

.icon.small {
  width: 16px;
  height: 16px;
  font-size: 12px;
}

.icon.large {
  font-size: 18px;
  width: 24px;
  height: 24px;
}

.icon.clickable {
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.icon.clickable:hover {
  background-color: #ccc;
}
</style>
