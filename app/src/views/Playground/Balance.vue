<script setup lang="ts">
import Card from "@/components/Card.vue";
import List from "components/layout/List.vue";
import { reactive, computed, ref, onMounted, Ref } from "vue";
import DatePicker from "../../components/DatePicker.vue";
import type { PickedDate } from "@/components/DatePicker.vue";
import Label from "@/components/Label.vue";
import Btn from "@/components/Btn.vue";
import { request } from "@/utils/request";
import Popper from "@/components/layout/Popper.vue";
import { useToastStore } from "@/store/toast";

interface Balance {
  _id: string;
  user: string;
  value: number;
  category: number;
  type: 0 | 1; // 0 - income, 1 - expense
  createdTime: Date;
  updatedTime: Date;
  dateStamp: number;
  year: number;
  month: number;
  date: number;
  description: string;
}

interface BalanceDTO {
  value: number;
  category: number;
  type: number;
  dateStamp: number;
  description?: string;
}

const [toastStore] = [useToastStore()];

/**
 * date picker
 */
const cur = new Date();
const date = reactive({
  year: cur.getFullYear(),
  month: cur.getMonth(),
  date: cur.getDate(),
} as PickedDate);
const computedDate = computed(() => {
  return `${date.year}-${date.month + 1}-${date.date}`;
});
const updateDate = async (newDate: PickedDate) => {
  Object.assign(date, newDate);
  data.value = await getByDate()
};

/**
 * tag list
 */
type Tag = { id: number; name: string; icon?: string };
type Tags = { [0]: Tag[]; 1: Tag[] };
const tags: Tags = {
  0: [
    { id: 10, name: "工资" },
    { id: 11, name: "抽奖" },
  ],
  1: [{ id: 20, name: "饭" }],
};
const type: Ref<0 | 1> = ref(1);
const changeType = () => {
  type.value = type.value ? 0 : 1;
  selectTag({} as Tag);
};
const getTagName = (balance: Balance) => {
  const balanceTag = tags[balance.type].find(
    (tag) => tag.id === balance.category
  );
  return balanceTag?.name || "";
};

/**
 * tag selection
 */
const activeTag = reactive({} as Tag);
const selectTag = (tag: Tag) => {
  activeTag.id = tag.id;
  activeTag.name = tag.name;
  activeTag.icon = tag.icon;
  showTagList.value = false;
};
const unselectTag = () => {
  selectTag({} as Tag);
};
const showTagList = ref(false);
const toggleTagList = () => {
  showTagList.value = !showTagList.value;
};

const description = ref("");

/**
 * money
 */
const money = ref(0);
const onInputMoney = () => {
  const tmp = `${money.value}`.split(".");
  if (tmp.length > 1 && tmp[1].length > 2) {
    tmp[1] = tmp[1].slice(0, 2);
  }
  money.value = parseFloat(tmp.join("."));
};

/**
 * dataing
 */
let data = ref([] as Balance[]);
const getDateStamp = ({ year, month, date }: PickedDate) =>
  new Date(year, month, date).getTime();
const submit = async () => {
  if (!activeTag.id || isNaN(money.value)) {
    toastStore.showToast({ content: "类型和金额需要填哦～", type: "ERR" });
    return;
  }
  if (money.value <= 0) {
    toastStore.showToast({ content: "至少得1分吧！", type: "ERR" });
  }
  const dto: BalanceDTO = {
    category: activeTag.id,
    value: money.value,
    type: type.value,
    dateStamp: getDateStamp(date),
    description: description.value,
  };
  data.value = await request(`/balance`, "POST", JSON.stringify(dto));
};
const init = async () => {
  data.value = await getByDate()
};
const getByDate = async () => {
  return (await request(`/balance/${getDateStamp(date)}`)) as Balance[];
}
init();
</script>

<template>
  <List>
    <template v-slot:content>
      <Card>
        <template v-slot:title>统计</template>
      </Card>
      <Card>
        <template v-slot:title>日期</template>
        <DatePicker v-on:change="updateDate" />
        <div class="entry">
          <div class="label">日期</div>
          <input class="text-input" v-model="computedDate" disabled />
        </div>
        <div class="entry">
          <div class="label">类型</div>
          <Label @click="changeType" :active="type === 0">{{
            type === 1 ? "支出" : "收入"
          }}</Label>
          <div class="dropdown">
            <input
              class="text-input"
              v-model="activeTag.name"
              @click="toggleTagList"
              @blur="toggleTagList"
            />
            <div class="unselect" @click="unselectTag" v-if="activeTag.name">
              ×
            </div>
            <Popper :show="showTagList">
              <template v-slot:content>
                <div class="tag-list">
                  <div
                    class="tag"
                    v-for="tag in tags[type]"
                    @click="selectTag(tag)"
                    :class="{ active: tag.id === activeTag.id }"
                  >
                    {{ tag.name }}
                  </div>
                </div>
              </template>
            </Popper>
          </div>
        </div>
        <div class="entry">
          <div class="label">备注</div>
          <input class="text-input" v-model="description" />
        </div>
        <div class="entry">
          <div class="label">金额</div>
          <input
            class="text-input"
            type="number"
            min="0.01"
            v-model="money"
            @input="onInputMoney"
          />
          <Btn class="btn submit" @click="submit">提交</Btn>
        </div>
      </Card>
      <div v-if="!data.length" class="ending">—— 这一天还没有记账哦 ——</div>
      <Card v-else>
        <div class="table">
          <div class="row header">
            <div class="type" style="opacity: 0"></div>
            <div class="category">类型</div>
            <div class="description">描述</div>
            <div class="value">金额</div>
          </div>
          <div v-for="record in data" :key="record._id" class="row">
            <div
              class="type"
              :style="{
                'background-color': record.type === 0 ? 'red' : 'green',
              }"
            ></div>
            <div class="category">{{ getTagName(record) }}</div>
            <div class="description">{{ record.description }}</div>
            <div class="value">{{ record.value }}</div>
          </div>
        </div>
      </Card>
    </template>
  </List>
</template>

<style lang="scss" scoped>
.entry {
  display: flex;
  align-items: center;
  margin: 0 0 1rem 0;

  .label {
    margin-right: 0.5rem;
    flex: 0 0 auto;
  }

  .dropdown {
    position: relative;
    flex: 1 1 auto;

    .text-input {
      width: 100%;
      box-sizing: border-box;
    }

    .tag-list {
      display: flex;
      flex: 1 0 auto;
      column-gap: 0.75rem;
      text-align: left;

      .tag {
        padding: 4px 8px;
        box-shadow: 1px 1px 8px 1px #dadada;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
      }

      .active {
        border: #2285d0;
        background-color: #2285d0;
        box-shadow: 1px 1px 8px 0px #7fc3f7;
        color: white;
      }
    }

    .unselect {
      position: absolute;
      display: flex;
      justify-content: right;
      align-items: center;
      width: 1.5rem;
      height: 100%;
      padding-right: 0.375rem;
      top: 0;
      right: 0;
      font-size: 1.25rem;
      color: #666;
    }
  }

  .btn {
    flex: 0 0 auto;
  }

  .submit {
    margin-left: 0.5rem;
  }
}

.ending {
  margin-top: 1rem;
  font-size: 12px;
  color: #aaa;
}

.table {
  .row {
    display: flex;
    align-items: center;
    height: 2rem;
    text-align: left;
    font-size: .875rem;
    .type {
      margin-right: 1rem;
      width: .5rem;
      height: .5rem;
      border-radius: 100%;
      background-color: blue;
    }
    .category {
      width: 4rem;
    }
    .description {
      flex: 1 1 auto;
      color: #aaa;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .value {
      width: 4rem;
      text-align: right;
    }
  }
  .header {
    color: #aaa;
    font-size: .75rem;
  }
}
</style>
