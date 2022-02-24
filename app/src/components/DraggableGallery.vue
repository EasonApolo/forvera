<script setup lang="ts">
import { useSlots } from 'vue';
import { ref } from 'vue'
import draggable from 'vuedraggable'

const { isDraggable = false, onDrag, onRemove } = defineProps<{ images: string[], onClick?: (index: number) => void, isDraggable?: boolean, onDrag?: (newIndex: number, oldIndex: number) => void, onRemove?: (removeIndex: number) => void }>()
let dragSrc: number | undefined = undefined
let dragTgt: number | undefined = undefined
let drag = ref(false)
const onDragStart = (index: number) => {
  dragSrc = index
  drag.value = true
  console.log(drag)
}
const onDragEnter = (index: number) => {
  dragTgt = index
  if (dragTgt !== undefined && dragSrc !== undefined) {
    onDrag?.(dragTgt, dragSrc)
    dragSrc = dragTgt
  }
}
const onDragEnd = () => {
  if (dragTgt === -1 && dragSrc !== undefined) {
    onRemove?.(dragSrc)
  }
  dragSrc = dragTgt = undefined
  drag.value = false
}
const onDragEnterRemove = () => {
  dragTgt = -1
}
const onDragLeaveRemove = () => {
  dragTgt = undefined
}
</script>

<template>
  <div class="gallery-wrapper">
    <div class="gallery">
      <div
        class="item"
        :style="{ backgroundImage: `url(${img})` }"
        v-for="(img, index) in images"
        @click="onClick?.(index)"
        draggable="true"
        @dragstart="onDragStart(index)"
        @dragenter="onDragEnter(index)"
        @dragend="onDragEnd()"
      ></div>
    </div>
    <div
      class="remove"
      v-if="drag"
      @dragenter="onDragEnterRemove"
      @dragleave="onDragLeaveRemove"
      @dragover.prevent
    ></div>
  </div>
</template>

<style lang="scss" scoped>
.gallery-wrapper {
  margin: 1rem 0;
  .gallery {
    display: flex;
    grid-template-columns: repeat(auto-fill, 6rem);
    grid-gap: 1rem;
    .item {
      width: 6rem;
      height: 6rem;
      background-position: center;
      background-size: cover;
      background-repeat: no-repeat;
    }
  }
  .remove {
    margin-top: 1rem;
    width: 100%;
    height: 2.5rem;
    border-radius: 4px;
    background: url(../assets/remove.png) center/1.5rem no-repeat;
    background-color: red;
  }
}
</style>
