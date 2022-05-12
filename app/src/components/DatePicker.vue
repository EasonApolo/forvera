<script setup lang="ts">
import { reactive, computed, ref, onMounted } from 'vue'

// initialize
const cur = new Date()
const curYear = cur.getFullYear()
const curMonth = cur.getMonth()
const curDate = cur.getDate()

// picker scroll initialize
const yearPicker: any = ref(null)
const monthPicker: any = ref(null)
onMounted(() => {
  yearPicker.value.scrollLeft = (calendar.year.indexOf(datePicker.year) * 3) * 16
  monthPicker.value.scrollLeft = (calendar.month.indexOf(datePicker.month) * 2) * 16
})

// update methods
const getAllDateInMonth = ({ m, y }: { m: number, y: number }) => {
  if ([4, 6, 9, 11].includes(m + 1)) return 30
  else if (m + 1 === 2) return y % 4 ? 28 : 29
  else return 31
}
type DateInfo = {
  year: number
  month: number
  date: number
}
const makeDate = ({ year, month, date }: DateInfo) => {
  const d = new Date()
  d.setFullYear(year)
  d.setMonth(month)
  d.setDate(date)
  return d
}
const getDayOffsetInMonth = () => {
  const d = makeDate({ ...datePicker, date: 1 })
  return d.getDay() === 0 ? 6 : d.getDay() - 1
}

// main data source
const datePicker = reactive({ year: curYear, month: curMonth, date: curDate })
const calendar = reactive({
  year: [curYear - 1, curYear],
  month: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  date: getAllDateInMonth({ m: curMonth, y: curYear }),
  dayOffset: getDayOffsetInMonth(),
  DAY: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
})

const computedDate = computed(() => {
  return `${datePicker.year}-${datePicker.month + 1}-${datePicker.date}`
})

// onSelect
const selectDate = (newDate: number) => {
  datePicker.date = newDate
}
const selectYear = (newYear: number) => {
  datePicker.year = newYear
  calendar.dayOffset = getDayOffsetInMonth()
  if (datePicker.date > calendar.date) datePicker.date = 1
}
const selectMonth = (newMonth: number) => {
  datePicker.month = newMonth
  calendar.date = getAllDateInMonth({ m: datePicker.month, y: datePicker.year })
  calendar.dayOffset = getDayOffsetInMonth()
  if (datePicker.date > calendar.date) datePicker.date = 1
}

</script>

<template>
  <div class="date-picker">日期
    <div class="header">
      <div class="year-picker" ref="yearPicker">
        <div class="year" :class="{ active: datePicker.year === y }" v-for="y in calendar.year" @click="selectYear(y)">
          {{ y }}</div>
      </div>
      <div class="month-picker" ref="monthPicker">
        <div class="month" :class="{ active: datePicker.month === m }" v-for="m in calendar.month"
          @click="selectMonth(m)">{{ m + 1 }}</div>
      </div>
    </div>
    <div class="calendar">
      <div class="h" v-for="d in calendar.DAY">{{ d }}</div>
      <div class="" v-for="o in calendar.dayOffset"></div>
      <div class="date" :class="{ active: datePicker.date === i }" v-for="i in calendar.date" @click="selectDate(i)">
        {{ i }}</div>
    </div>
  </div>
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