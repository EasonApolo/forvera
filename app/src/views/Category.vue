<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import List from '../components/layout/List.vue'
import { useCategories } from '../store/category'
import { usePostDetail } from '../store/postDetail'
import { computed } from 'vue'

const [categoryStore] = [useCategories()]
const { categories, editing } = storeToRefs(categoryStore)
categoryStore.init()

const submitText = computed(() => {
  return editing.value._id ? '更新' : '新增'
})

const submit = async ({ remove = false }) => {
  if (remove) {
    await categoryStore.delete()
  } else if (editing.value._id) {
    await categoryStore.update()
  } else {
    await categoryStore.add()
  }
  categoryStore.fetchCategories()
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="edit-wrapper">
        <input class="text-input" v-model="editing.title" />
        <input class="text-input" v-model="editing.description" />
        <div class="actions">
          <Btn type="primary" @click="submit({})">{{ submitText }}</Btn>
          <Btn
            @click="categoryStore.clear()"
            v-if="editing.title || editing.description"
            >取消</Btn
          >
          <Btn class="right" @click="submit({ remove: true })">删除</Btn>
        </div>
      </Card>
      <Card v-for="cat in categories" class="category">
        <span>{{ cat.title }}</span
        ><span class="description">{{ cat.description }}</span>
        <Btn class="right" @click="categoryStore.editing = cat">编辑</Btn>
      </Card>
    </template>
  </List>
</template>

<style lang="less" scoped>
.edit-wrapper {
  & > *:not(:last-child) {
    margin-bottom: 0.5rem;
  }
  .actions {
    display: flex;
    & > .button:not(:last-child) {
      margin-right: 1rem;
    }
    .right {
      margin-left: auto;
    }
  }
}
.category {
  display: flex;
  align-items: center;
  .description {
    margin-left: 0.5rem;
    font-size: 14px;
    color: #888;
  }
  .right {
    margin-left: auto;
  }
}
</style>
