<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    rows: string[]
    cols: string[]
    content: (string | number)[][]
  }>(),
  {
    rows: () => [],
    cols: () => [],
    content: () => [],
  },
)
</script>

<template>
  <div class="common-table-scroll">
    <table class="common-table">
      <colgroup>
        <!-- 行标题固定列 -->
        <col class="row-title-col" />
        <!-- 内容数据列 -->
        <col v-for="col in cols" :key="col" class="content-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" class="row-title-head"></th>
          <th v-for="col in cols" :key="col" scope="col" class="col-head">
            {{ col }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, rowIndex) in rows" :key="rowIndex">
          <!-- 左侧第一列：行名称 -->
          <th scope="row" class="row-name-cell">{{ row }}</th>
          <!-- 内部数据矩阵 -->
          <td v-for="(col, colIndex) in cols" :key="col" class="content-cell">
            <slot
              name="cell"
              :value="content[rowIndex]?.[colIndex]"
              :row-index="rowIndex"
              :col-index="colIndex"
              :row="row"
              :col="col"
            >
              {{ content[rowIndex]?.[colIndex] ?? '' }}
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped lang="less">
.common-table-scroll {
  overflow-x: auto;
}

.common-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
}

.row-title-col {
  width: 120px;
}

.content-col {
  width: 60px;
}

th,
td {
  padding: 8px 10px;
  text-align: center;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

thead th {
  font-weight: 700;
  background: var(--card-bg);
  position: sticky;
  top: 0;
  z-index: 1;
}

.row-title-head,
.row-name-cell {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--card-bg);
  text-align: left;
}
</style>