<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import List from '@/components/layout/List.vue'
import BottomNavBar from '@/components/layout/BottomNavBar.vue'
import Card from '@/components/Card.vue'
import CircleBtn from '@/components/CircleBtn.vue'
import EditableInput from '@/components/EditableInput.vue'
import Checkbox from '@/components/Checkbox.vue'
import { useRequirementsStore, type RequirementTask } from '@/store/requirements'

const requirementsStore = useRequirementsStore()
const initialized = ref(false)
const viewMode = ref<'active' | 'completed'>('active')

const tasks = computed(() => {
  const roots = requirementsStore.tasks.filter(task => !task.parent)
  const childMap = new Map<string, RequirementTask[]>()

  requirementsStore.tasks.forEach(task => {
    if (!task.parent) return
    const list = childMap.get(task.parent) || []
    list.push(task)
    childMap.set(task.parent, list)
  })

  const sortRootsById = (list: RequirementTask[]) => [...list].sort((a, b) => b.id - a.id)
  const sortSubtasksById = (list: RequirementTask[]) => [...list].sort((a, b) => a.id - b.id)

  return sortRootsById(roots).map(task => ({
    task,
    subtasks: sortSubtasksById(childMap.get(task._id) || []),
  }))
})

const refresh = async () => {
  await requirementsStore.fetchAll(viewMode.value)
  initialized.value = true
}

const addTask = async () => {
  const created = await requirementsStore.createTask(null)
  await refresh()
  if (created?._id) {
    document.getElementById(`requirement-task-${created._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

const addSubtask = async (parentId: string) => {
  const created = await requirementsStore.createTask(parentId)
  await refresh()
  if (created?._id) {
    document.getElementById(`requirement-task-${created._id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

const formatDateTime = (value: string) => {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '--'
  const yyyy = d.getFullYear()
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  const hh = `${d.getHours()}`.padStart(2, '0')
  const min = `${d.getMinutes()}`.padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}

const updateTitle = async (task: RequirementTask, title: string) => {
  await requirementsStore.updateTask(task._id, { title })
  await refresh()
}

const isRootTask = (task: RequirementTask) => !task.parent

const toggleChecked = async (task: RequirementTask, checked: boolean) => {
  if (isRootTask(task)) {
    const confirmed = window.confirm(checked ? '确认将该 task 标记为完成？' : '确认取消该 task 的完成状态？')
    if (!confirmed) return
  }
  await requirementsStore.updateTask(task._id, { checked })
  await refresh()
}

const moveTop = async (task: RequirementTask) => {
  await requirementsStore.moveTop(task._id)
  await refresh()
}

const moveSubtask = async (task: RequirementTask, direction: 'up' | 'down') => {
  await requirementsStore.moveTask(task._id, direction)
  await refresh()
}

const deleteSubtask = async (task: RequirementTask) => {
  if (isRootTask(task)) return
  const confirmed = window.confirm('确认删除该 subtask？')
  if (!confirmed) return
  await requirementsStore.deleteTask(task._id)
  await refresh()
}

const deleteRootTask = async (task: RequirementTask) => {
  if (!isRootTask(task)) return
  const confirmed = window.confirm('确认删除该 task 及其所有 subtask？')
  if (!confirmed) return
  await requirementsStore.deleteTask(task._id)
  await refresh()
}

const toggleViewMode = async () => {
  viewMode.value = viewMode.value === 'active' ? 'completed' : 'active'
  await refresh()
}

const navItems = computed(() => [
  { key: 'back', label: '‹ 返回' },
  { key: 'add', label: '添加' },
  { key: 'switch', label: viewMode.value === 'active' ? '显示完成' : '显示未完成' },
])

const handleNavSelect = async (key: string) => {
  if (key === 'back') {
    history.back()
    return
  }
  if (key === 'add') {
    await addTask()
    return
  }
  if (key === 'switch') {
    await toggleViewMode()
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <List>
    <template #content>
      <div v-if="initialized && !tasks.length" class="empty-card">暂无 task，先点添加。</div>

      <template v-else-if="tasks.length">
        <Card v-for="entry in tasks" :key="entry.task._id" class="task-card">
          <div class="task-row" :id="`requirement-task-${entry.task._id}`">
            <div class="task-main">
              <Checkbox :model-value="entry.task.checked" @update:modelValue="toggleChecked(entry.task, $event)" />
              <EditableInput
                class="task-title"
                :model-value="entry.task.title"
                placeholder="空task"
                :max-length="50"
                @update:modelValue="updateTitle(entry.task, $event)"
                @submit="updateTitle(entry.task, $event)"
              />
              <span class="task-created-time">{{ formatDateTime(entry.task.created_time) }}</span>
            </div>
            <div class="task-actions">
              <CircleBtn
                v-if="!entry.subtasks.length"
                class="add-subtask-btn"
                :size="24"
                :fontSize="18"
                aria-label="添加 subtask"
                @click="addSubtask(entry.task._id)"
              >+</CircleBtn>
              <CircleBtn
                v-if="!entry.task.checked"
                class="move-task-top-btn"
                icon="chevron-up"
                :size="24"
                :fontSize="14"
                aria-label="置顶 task"
                @click="moveTop(entry.task)"
              />
              <CircleBtn class="delete-task-btn" icon="close" :size="24" :fontSize="16" aria-label="删除 task" @click="deleteRootTask(entry.task)" />
            </div>
          </div>

          <div v-if="entry.subtasks.length" class="subtask-list">
            <div v-for="(subtask, index) in entry.subtasks" :key="subtask._id" class="subtask-card">
              <div class="subtask-row" :id="`requirement-task-${subtask._id}`">
                <div class="subtask-main">
                  <Checkbox :model-value="subtask.checked" @update:modelValue="toggleChecked(subtask, $event)" />
                  <EditableInput
                    class="subtask-title"
                    :model-value="subtask.title"
                    placeholder="空task"
                    :max-length="50"
                    @update:modelValue="updateTitle(subtask, $event)"
                    @submit="updateTitle(subtask, $event)"
                  />
                </div>
                <div class="subtask-actions">
                  <CircleBtn
                    class="move-subtask-btn"
                    icon="chevron-up"
                    :size="18"
                    :fontSize="11"
                    aria-label="上移 subtask"
                    @click="moveSubtask(subtask, 'up')"
                  />
                  <CircleBtn
                    class="delete-subtask-btn"
                    icon="close"
                    :size="18"
                    :fontSize="11"
                    aria-label="删除 subtask"
                    @click="deleteSubtask(subtask)"
                  />
                </div>
              </div>
            </div>
            <div class="subtask-card subtask-add-row">
              <CircleBtn
                class="add-subtask-btn"
                :size="18"
                :fontSize="12"
                aria-label="添加 subtask"
                @click="addSubtask(entry.task._id)"
              >+</CircleBtn>
            </div>
          </div>
        </Card>
      </template>

      <BottomNavBar :items="navItems" @select="handleNavSelect" />
    </template>
  </List>
</template>

<style scoped lang="less">
.empty-card {
  padding: 1rem;
  color: var(--text-secondary);
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-card {
  padding: 0.7rem 0.75rem;
}

.task-row,
.subtask-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.task-main,
.subtask-main {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  flex: 1;
  text-align: left;
}

.task-title {
  min-width: 0;
  font-size: 14px;
  text-align: left;
}

.task-created-time {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.task-title,
.subtask-title {
  :deep(.editable-text) {
    border-bottom: none;
  }
}

.subtask-list {
  margin-top: 0.2rem;
  padding-left: 0.3rem;
  border-left: 1px solid var(--border-light);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.subtask-card {
  padding: 0.25rem 0 0.25rem 0.35rem;
}

.subtask-title {
  min-width: 0;
  font-size: 12px;
  font-weight: 400;
  text-align: left;
}

.task-actions,
.subtask-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.task-actions {
  justify-content: flex-end;
  min-width: 7.1rem;
}

.subtask-actions {
  justify-content: flex-end;
  min-width: 3.9rem;
}

.subtask-add-row {
  display: flex;
  justify-content: flex-start;
}

.add-subtask-btn {
  flex: 0 0 auto;
}

.move-subtask-btn,
.move-task-top-btn,
.delete-task-btn,
.delete-subtask-btn {
  flex: 0 0 auto;
}

:deep(.nav) {
  bottom: 1rem;
}
</style>