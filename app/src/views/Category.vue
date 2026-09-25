<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Btn from '../components/Btn.vue'
import Card from '../components/Card.vue'
import Input from '../components/Input.vue'
import List from '../components/layout/List.vue'
import SortableList from '../components/SortableList.vue'
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

// 排序完成：把新顺序的 id 列表提交给后端
const onReorder = (list: Category[]) => {
  categoryStore.reorder(list.map(cat => cat._id))
}
</script>

<template>
  <List>
    <template v-slot:content>
      <Card class="edit-wrapper">
        <Input v-model="editing.title" />
        <Input v-model="editing.description" />
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
      <SortableList class="cat-list" :model-value="categories" item-key="_id" @confirm="onReorder">
        <template #default="{ item: cat, sortMode }">
          <Card class="category">
            <span class="title">{{ cat.title }}</span
            ><span class="description">{{ cat.description }}</span>
            <Btn v-if="!sortMode" class="right" @click="categoryStore.editing = cat">编辑</Btn>
          </Card>
        </template>
      </SortableList>
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
.cat-list {
  margin-top: 0.5rem;
}
.category {
  display: flex;
  align-items: center;
  .title {
    flex: 0 0 auto;
  }
  .description {
    margin-left: 0.5rem;
    font-size: 14px;
    text-align: left;
    color: var(--text-secondary);
  }
  .right {
    margin-left: auto;
  }
}
</style>
