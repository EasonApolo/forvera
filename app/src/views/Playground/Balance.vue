<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from '@/components/Card.vue'
import List from 'components/layout/List.vue'
import { reactive, computed, ref, onMounted } from 'vue'
import DatePicker from '../../components/DatePicker.vue'

interface Balance {
  user: string
  value: Number,
  category: Number,
  type: Number, // 0 - income, 1 - expense
  created_time: Date,
  updated_time: Date,
  full_date: Date,
  year: Number,
  month: Number,
  date: Number,
  description: String,
}

</script>

<template>
  <List>
    <template v-slot:content>
      <Card>
        <DatePicker />
        <div>日期<input v-model="computedDate"></div>
        <div>金额<input type="number"></div>
        <div>类型</div>
        <div>备注<input></div>
      </Card>
      <Card>

      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.date-picker {
  margin: 0 auto;
  width: max-content;
  text-align: center;

  .header {
    display: flex;
    justify-content: space-between;
  }

  .year-picker {
    width: 6rem;

    .year {
      width: 3rem;

      &:first-child {
        margin-left: 1.5rem;
      }

      &:last-child {
        margin-right: 1.5rem;
      }
    }
  }

  .month-picker {
    width: 4rem;

    .month {
      width: 2rem;

      &:first-child {
        margin-left: 1rem;
      }

      &:last-child {
        margin-right: 1rem;
      }
    }
  }

  .year-picker,
  .month-picker {
    display: flex;
    overflow-x: auto;

    .year,
    .month {
      flex: 0 0 auto;
      text-align: center;
      line-height: 1.5rem;
      height: 1.5rem;
    }

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .active {
    color: white !important;
    background-color: #42b983 !important;
  }

  .year,
  .month,
  .date {
    transition: background-color .2s ease, color .2s ease;
    cursor: pointer;

    &:hover {
      color: inherit;
      background-color: #eee;
    }
  }

  .calendar {
    margin: 0 auto;
    display: flex;
    width: 14rem;
    flex-wrap: wrap;

    div {
      width: 2rem;
      height: 1.75rem;
      line-height: 1.75rem;
      text-align: center;
    }

    .h {
      font-size: 12px;
      color: #bbb;
    }

  }

}
</style>