<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import List from '@/components/layout/List.vue'
import Btn from '@/components/Btn.vue'
import Input from '@/components/Input.vue'
import Textarea from '@/components/Textarea.vue'
import FileInput from '@/components/FileInput.vue'
import { useTaxonomyStore, type TaxonomyNode } from '@/store/taxonomy'
import { useUserStore } from '@/store/user'
import { storeToRefs } from 'pinia'
import { ip } from '@/config'
import { useImageStore } from '@/store/image'
import { useToastStore } from '@/store/toast'

type FlatNode = {
  node: TaxonomyNode
  depth: number
}

type DropPosition = 'before' | 'inside' | 'after'

const taxonomyStore = useTaxonomyStore()
const userStore = useUserStore()
const imageStore = useImageStore()
const toastStore = useToastStore()
const { isAdmin } = storeToRefs(userStore)

const loading = ref(false)
const draggingId = ref<string | null>(null)
const dropTarget = ref<{ id: string; position: DropPosition } | null>(null)
const collapsedNodeIds = ref(new Set<string>())
const hasLoadedCollapseState = ref(false)
const searchKeyword = ref('')
const searchPanelVisible = ref(false)

const modal = reactive({
  show: false,
  editingId: '' as string,
  createdTime: '',
  parent: null as string | null,
  title: '',
  description: '',
  images: [] as string[],
  files: [] as File[],
  saving: false,
})

const preview = reactive({
  show: false,
  title: '',
  description: '',
  images: [] as string[],
  createdTime: '',
})

const nodes = computed(() => taxonomyStore.nodes)

const idMap = computed(() => {
  const map = new Map<string, TaxonomyNode>()
  nodes.value.forEach(node => map.set(node._id, node))
  return map
})

const childMap = computed(() => {
  const map = new Map<string | null, TaxonomyNode[]>()
  nodes.value.forEach(node => {
    const parent = node.parent || null
    if (!map.has(parent)) map.set(parent, [])
    map.get(parent)!.push(node)
  })
  map.forEach(list => {
    list.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.created_time.localeCompare(b.created_time)
    })
  })
  return map
})

const nodesWithChildren = computed(() => {
  const ids = new Set<string>()
  childMap.value.forEach((children, parentId) => {
    if (parentId && children.length > 0) {
      ids.add(parentId)
    }
  })
  return ids
})

const hasChildren = (nodeId: string) => nodesWithChildren.value.has(nodeId)

const isCollapsed = (nodeId: string) => collapsedNodeIds.value.has(nodeId)

const toggleCollapse = (nodeId: string) => {
  if (!hasChildren(nodeId)) return
  const next = new Set(collapsedNodeIds.value)
  if (next.has(nodeId)) next.delete(nodeId)
  else next.add(nodeId)
  collapsedNodeIds.value = next
}

const syncCollapsedState = (collapseAll: boolean) => {
  const next = new Set<string>()
  if (collapseAll) {
    nodesWithChildren.value.forEach(id => next.add(id))
  } else {
    collapsedNodeIds.value.forEach(id => {
      if (nodesWithChildren.value.has(id)) {
        next.add(id)
      }
    })
    nodesWithChildren.value.forEach(id => {
      if (!collapsedNodeIds.value.has(id)) {
        next.add(id)
      }
    })
  }
  collapsedNodeIds.value = next
}

const flattened = computed<FlatNode[]>(() => {
  const result: FlatNode[] = []
  const walk = (parent: string | null, depth: number) => {
    const children = childMap.value.get(parent) || []
    children.forEach(child => {
      result.push({ node: child, depth })
      if (!isCollapsed(child._id)) {
        walk(child._id, depth + 1)
      }
    })
  }
  walk(null, 0)
  return result
})

const searchResults = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return [] as TaxonomyNode[]
  return nodes.value.filter(node => {
    return (
      node.title.toLowerCase().includes(keyword) ||
      (node.description || '').toLowerCase().includes(keyword)
    )
  })
})

const getThumb = (url: string) => {
  const dotIndex = url.lastIndexOf('.')
  const thumb = dotIndex === -1 ? `${url}_thumb` : `${url.slice(0, dotIndex)}_thumb${url.slice(dotIndex)}`
  return `${ip}${thumb}`
}

const getFull = (url: string) => `${ip}${url}`

const refresh = async () => {
  loading.value = true
  try {
    // 保存当前的展开/关闭状态
    const prevCollapsedState = new Set(collapsedNodeIds.value)
    
    await taxonomyStore.fetchAll()
    
    if (!hasLoadedCollapseState.value) {
      // 第一次加载，全部关闭
      syncCollapsedState(true)
      hasLoadedCollapseState.value = true
    } else {
      // 后续加载，保留之前的展开状态，只清理那些不再有子节点的节点
      const next = new Set<string>()
      prevCollapsedState.forEach(id => {
        if (nodesWithChildren.value.has(id)) {
          next.add(id)
        }
      })
      collapsedNodeIds.value = next
    }
  } finally {
    loading.value = false
  }
}

const formatCreatedTime = (value: string) => {
  if (!value) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}.${month}.${day}`
}

const expandChainOnly = async (nodeId: string) => {
  const next = new Set<string>()
  nodesWithChildren.value.forEach(id => next.add(id))

  let current: string | null = nodeId
  while (current) {
    next.delete(current)
    current = idMap.value.get(current)?.parent || null
  }

  collapsedNodeIds.value = next
  searchPanelVisible.value = false

  await nextTick()
  const el = document.getElementById(`taxonomy-node-${nodeId}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

const openCreate = (parent: string | null = null) => {
  if (!isAdmin.value) return
  modal.show = true
  modal.editingId = ''
  modal.createdTime = ''
  modal.parent = parent
  modal.title = ''
  modal.description = ''
  modal.images = []
  modal.files = []
}

const openEdit = (node: TaxonomyNode) => {
  if (!isAdmin.value) return
  modal.show = true
  modal.editingId = node._id
  modal.createdTime = node.created_time
  modal.parent = node.parent || null
  modal.title = node.title
  modal.description = node.description
  modal.images = [...(node.images || [])]
  modal.files = []
}

const closeModal = () => {
  if (modal.saving) return
  modal.show = false
}

const handleSelectFiles = (target: HTMLInputElement) => {
  const list = Array.from(target.files || [])
  if (!list.length) return
  modal.files.push(...list)
  target.value = ''
}

const removeExistingImage = (index: number) => {
  modal.images.splice(index, 1)
}

const removeNewFile = (index: number) => {
  modal.files.splice(index, 1)
}

const truncateDescription = (description: string) => {
  if (!description) return ''
  return description.length > 10 ? `${description.slice(0, 10)}...` : description
}

const openPreview = (node: TaxonomyNode) => {
  preview.show = true
  preview.title = node.title
  preview.description = node.description || ''
  preview.images = [...(node.images || [])]
  preview.createdTime = node.created_time
}

const closePreview = () => {
  preview.show = false
}

const saveModal = async () => {
  if (!isAdmin.value) return
  const title = modal.title.trim()
  if (!title) {
    toastStore.showToast({ content: '名称不能为空', type: '!' })
    return
  }

  modal.saving = true
  try {
    let nodeId = modal.editingId

    if (!nodeId) {
      const created = await taxonomyStore.create({
        title,
        description: modal.description,
        parent: modal.parent,
      })
      nodeId = created._id
    }

    let mergedImages = [...modal.images]
    if (modal.files.length) {
      const uploaded = await taxonomyStore.uploadImages(nodeId, modal.files)
      mergedImages = mergedImages.concat(uploaded.map(file => file.url))
    }

    await taxonomyStore.update(nodeId, {
      title,
      description: modal.description,
      images: mergedImages,
    })

    modal.show = false
    await refresh()
  } finally {
    modal.saving = false
  }
}

const removeNode = async (node: TaxonomyNode) => {
  if (!isAdmin.value) return
  if (!confirm(`确认删除「${node.title}」及其子节点吗？`)) return
  await taxonomyStore.remove(node._id)
  await refresh()
}

const getNodeAncestors = (nodeId: string) => {
  const ancestors = new Set<string>()
  let current = idMap.value.get(nodeId)?.parent || null
  while (current) {
    ancestors.add(current)
    current = idMap.value.get(current)?.parent || null
  }
  return ancestors
}

const onDragStart = (nodeId: string) => {
  if (!isAdmin.value) return
  draggingId.value = nodeId
}

const onDragOver = (event: DragEvent, target: TaxonomyNode) => {
  if (!isAdmin.value) return
  if (!draggingId.value) return
  event.preventDefault()

  const element = event.currentTarget as HTMLElement
  const rect = element.getBoundingClientRect()
  const y = event.clientY - rect.top
  const ratio = y / rect.height
  let position: DropPosition = 'inside'
  if (ratio < 0.25) position = 'before'
  else if (ratio > 0.75) position = 'after'

  dropTarget.value = { id: target._id, position }
}

const findSiblingOrder = (
  parent: string | null,
  targetId: string,
  position: 'before' | 'after',
  draggedId: string
) => {
  const siblings = (childMap.value.get(parent) || []).filter(node => node._id !== draggedId)
  const targetIndex = siblings.findIndex(node => node._id === targetId)
  if (targetIndex === -1) return siblings.length
  return position === 'before' ? targetIndex : targetIndex + 1
}

const onDrop = async (target: TaxonomyNode) => {
  if (!isAdmin.value) return
  if (!draggingId.value || !dropTarget.value) return
  const draggedId = draggingId.value
  const { position } = dropTarget.value

  if (draggedId === target._id) {
    draggingId.value = null
    dropTarget.value = null
    return
  }

  let newParent: string | null = null
  let newOrder = 0

  if (position === 'inside') {
    newParent = target._id
    newOrder = (childMap.value.get(newParent) || []).filter(node => node._id !== draggedId).length
  } else {
    newParent = target.parent || null
    newOrder = findSiblingOrder(newParent, target._id, position, draggedId)
  }

  const draggedAncestors = getNodeAncestors(newParent || '')
  if (newParent === draggedId || draggedAncestors.has(draggedId)) {
    toastStore.showToast({ content: '不能拖拽到自己的子节点内', type: '!' })
    draggingId.value = null
    dropTarget.value = null
    return
  }

  await taxonomyStore.move(draggedId, { parent: newParent, order: newOrder })
  await refresh()

  draggingId.value = null
  dropTarget.value = null
}

const onDragEnd = () => {
  draggingId.value = null
  dropTarget.value = null
}

const onSearchFocus = () => {
  searchPanelVisible.value = true
}

const onSearchBlur = () => {
  setTimeout(() => {
    searchPanelVisible.value = false
  }, 120)
}

onMounted(() => {
  refresh()
})
</script>

<template>
  <List>
    <template v-slot:content>
      <div class="toolbar">
        <div class="left">Taxonomy</div>
        <div class="toolbar-right">
          <div class="search-wrapper">
            <Input
              class="search-input"
              placeholder="搜索节点"
              v-model="searchKeyword"
              @focus="onSearchFocus"
              @blur="onSearchBlur"
            />
            <div
              v-if="searchPanelVisible && searchKeyword.trim()"
              class="search-panel"
            >
              <div
                v-if="searchResults.length"
                class="search-item"
                v-for="node in searchResults"
                :key="node._id"
                @mousedown.prevent="expandChainOnly(node._id)"
              >
                <div class="name">{{ node.title }}</div>
                <div class="desc" v-if="node.description">{{ node.description }}</div>
              </div>
              <div v-else class="search-empty">无结果</div>
            </div>
          </div>
          <Btn v-if="isAdmin" small class="icon-btn" @click="openCreate(null)">+</Btn>
        </div>
      </div>

      <div v-if="loading" class="status-card">加载中...</div>

      <div v-else-if="!flattened.length" class="empty status-card">
        暂无节点，先新增一个根节点。
      </div>

      <div v-else class="tree">
        <div
          v-for="item in flattened"
          :key="item.node._id"
          :id="`taxonomy-node-${item.node._id}`"
          class="node-row"
          :style="{ paddingLeft: `${item.depth * 1.25}rem` }"
          :draggable="isAdmin"
          @dragstart="onDragStart(item.node._id)"
          @dragover="onDragOver($event, item.node)"
          @drop.prevent="onDrop(item.node)"
          @dragend="onDragEnd"
          :class="{
            'drop-before': dropTarget?.id === item.node._id && dropTarget?.position === 'before',
            'drop-inside': dropTarget?.id === item.node._id && dropTarget?.position === 'inside',
            'drop-after': dropTarget?.id === item.node._id && dropTarget?.position === 'after',
          }"
        >
          <div class="node-main">
            <div class="title-row">
              <div
                class="collapse-toggle"
                :class="{ hidden: !hasChildren(item.node._id) }"
                @click.stop="toggleCollapse(item.node._id)"
              >
                {{ isCollapsed(item.node._id) ? '▸' : '▾' }}
              </div>
              <div class="title" @click.stop="openPreview(item.node)">{{ item.node.title }}</div>
              <div class="extra">
                <div
                  class="description"
                  v-if="item.node.description"
                  :title="item.node.description"
                  @click.stop="openPreview(item.node)"
                >
                  {{ truncateDescription(item.node.description) }}
                </div>
                <div class="inline-thumbs" v-if="item.node.images?.length">
                  <div
                    class="thumb"
                    v-for="img in item.node.images"
                    :style="{ backgroundImage: `url(${getThumb(img)})` }"
                    @click.stop="imageStore.preview(getFull(img))"
                  ></div>
                </div>
              </div>
            </div>
          </div>
          <div class="actions" v-if="isAdmin">
            <Btn small class="icon-btn" @click.stop="openCreate(item.node._id)">+</Btn>
            <Btn small class="icon-btn" @click.stop="openEdit(item.node)">e</Btn>
            <Btn small class="icon-btn" type="danger" @click.stop="removeNode(item.node)">-</Btn>
          </div>
        </div>
      </div>

      <div v-if="modal.show" class="modal-mask" @click.self="closeModal">
        <div class="modal">
          <div class="modal-title">{{ modal.editingId ? '编辑节点' : '新增节点' }}</div>
          <div class="created-time" v-if="modal.createdTime">
            添加时间：{{ formatCreatedTime(modal.createdTime) }}
          </div>
          <div class="form-fields">
            <Input placeholder="名称" v-model="modal.title" />
            <Textarea placeholder="描述" :rows="10" v-model="modal.description"></Textarea>
          </div>

          <div class="upload-row">
            <FileInput :multiple="true" :change="handleSelectFiles" />
            <div class="tip">支持多图（可选）</div>
          </div>

          <div class="thumbs" v-if="modal.images.length || modal.files.length">
            <div class="thumb existing" v-for="(img, idx) in modal.images" :style="{ backgroundImage: `url(${getThumb(img)})` }">
              <div class="remove" @click.stop="removeExistingImage(idx)">×</div>
            </div>
            <div class="thumb pending" v-for="(file, idx) in modal.files">
              <div class="pending-name">{{ file.name }}</div>
              <div class="remove" @click.stop="removeNewFile(idx)">×</div>
            </div>
          </div>

          <div class="modal-actions">
            <Btn @click="closeModal">取消</Btn>
            <Btn type="primary" :loading="modal.saving" @click="saveModal">保存</Btn>
          </div>
        </div>
      </div>

      <div v-if="preview.show" class="modal-mask" @click.self="closePreview">
        <div class="modal preview-modal">
          <div class="preview-title">{{ preview.title }}</div>
          <div class="created-time" v-if="preview.createdTime || preview.position">
            <span v-if="preview.createdTime">添加时间：{{ formatCreatedTime(preview.createdTime) }}</span>
            <span v-if="preview.position"> 首次发现于：{{ preview.position }}</span>
          </div>
          <div class="preview-description">{{ preview.description || '无描述' }}</div>
          <div class="thumbs" v-if="preview.images.length">
            <div
              class="thumb"
              v-for="img in preview.images"
              :style="{ backgroundImage: `url(${getThumb(img)})` }"
              @click.stop="imageStore.preview(getFull(img))"
            ></div>
          </div>
        </div>
      </div>
    </template>
  </List>
</template>

<style lang="less" scoped>
.toolbar,
.tree,
.status-card,
.modal,
.search-panel {
  border-radius: 0.5rem;
  background-color: var(--card-bg);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;

  .left {
    font-size: 14px;
    font-weight: bold;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .search-wrapper {
    position: relative;

    .search-input {
      width: 96px;
      height: 32px;
      padding: 0 0.5rem;
      box-sizing: border-box;
    }

    .search-panel {
      position: absolute;
      top: calc(100% + 0.25rem);
      left: 0;
      width: 100%;
      z-index: 30;
      max-height: 16rem;
      overflow: auto;
      padding: 0.5rem;

      .search-item {
        text-align: left;
        padding: 0.35rem 0.4rem;
        border-radius: 4px;
        cursor: pointer;

        &:hover {
          background: var(--bg);
        }

        .name {
          font-size: 13px;
          font-weight: 600;
        }

        .desc {
          margin-top: 2px;
          font-size: 12px;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .search-empty {
        text-align: left;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }
  }
}

.status-card {
  margin-top: 0.5rem;
  padding: 0.5rem;
  text-align: left;
}

.icon-btn {
  width: 16px !important;
  min-width: 16px;
  height: 16px;
  padding: 0;
  line-height: 16px;
  font-size: 12px;
}

.empty {
  text-align: left;
  color: var(--text-secondary);
}

.tree {
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;

  .node-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.25rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border-light);

    &:last-child {
      border-bottom: none;
    }

    &.drop-before {
      border-top: 2px solid #1a73e8;
    }
    &.drop-inside {
      background: rgba(26, 115, 232, 0.08);
    }
    &.drop-after {
      border-bottom: 2px solid #1a73e8;
    }

    .node-main {
      flex: 1;
      min-width: 0;
      text-align: left;

      .title-row {
        display: flex;
        align-items: center;
        min-width: 0;

        .collapse-toggle {
          width: 1rem;
          margin-right: 0.2rem;
          text-align: center;
          cursor: pointer;
          user-select: none;

          &.hidden {
            visibility: hidden;
            cursor: default;
          }
        }

        .title {
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .extra {
          margin-left: 0.4rem;
          display: flex;
          align-items: center;
          min-width: 0;
          flex: 1;

          .description {
            max-width: 8rem;
            font-size: 12px;
            color: var(--text-secondary);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .inline-thumbs {
            margin-left: 0.25rem;
            display: flex;
            align-items: center;
            gap: 0.35rem;
            min-width: 0;
            overflow-x: auto;
            padding-bottom: 0.1rem;

            .thumb {
              width: 1.6rem;
              height: 1.6rem;
              border-radius: 4px;
              background-position: center;
              background-size: cover;
              background-repeat: no-repeat;
              border: 1px solid var(--border-light);
              flex: 0 0 auto;
            }
          }
        }
      }
    }

    .actions {
      display: flex;
      align-items: center;
      margin-left: 1rem;

      > .button:not(:last-child) {
        margin-right: 0.5rem;
      }
    }
  }
}

.thumbs {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;

  .thumb {
    width: 3rem;
    height: 3rem;
    border-radius: 4px;
    position: relative;
    background-position: center;
    background-size: cover;
    background-repeat: no-repeat;
    border: 1px solid var(--border-light);

    &.pending {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg);
      padding: 0.25rem;
      box-sizing: border-box;
      text-align: center;

      .pending-name {
        font-size: 10px;
        line-height: 1.2;
        overflow: hidden;
      }
    }

    .remove {
      position: absolute;
      top: -0.35rem;
      right: -0.35rem;
      width: 1rem;
      height: 1rem;
      line-height: 1rem;
      border-radius: 999px;
      background: #e53935;
      color: #fff;
      font-size: 12px;
      text-align: center;
      cursor: pointer;
      user-select: none;
    }
  }
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 140;

  .modal {
    width: min(42rem, calc(100vw - 1rem));
    margin: 0.5rem;
    padding: 0.5rem;

    .modal-title {
      text-align: left;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    .created-time {
      text-align: left;
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 0.5rem;
    }

    .form-fields {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .upload-row {
      margin-top: 0.75rem;
      display: flex;
      align-items: center;
      .tip {
        margin-left: 0.75rem;
        font-size: 12px;
        color: var(--text-secondary);
      }
    }

    .modal-actions {
      margin-top: 0.75rem;
      display: flex;
      justify-content: flex-end;
      > .button:not(:last-child) {
        margin-right: 0.5rem;
      }
    }

    &.preview-modal {
      max-height: 80vh;
      overflow-y: auto;

      padding: 0.5rem;

      .preview-title {
        text-align: left;
        font-size: 14px;
        font-weight: 700;
      }

      .preview-description {
        margin-top: 0.4rem;
        text-align: left;
        font-size: 13px;
        color: var(--text-secondary);
      }
    }
  }
}
</style>
