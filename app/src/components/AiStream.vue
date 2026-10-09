<script setup lang="ts">
import Loading from './Loading.vue'

defineProps<{ text: string; modelId?: string; status?: 'connecting' | 'streaming' }>()
</script>

<template>
  <section class="ai-stream" aria-live="polite" aria-label="AI 生成内容">
    <div class="stream-status">
      <Loading class="indicator" />
      <span>{{ status === 'connecting' ? '连接中' : '生成中' }}</span>
      <span v-if="modelId" class="model-id">{{ modelId }}</span>
    </div>
    <pre v-if="text" class="stream-text">{{ text }}</pre>
  </section>
</template>

<style lang="less" scoped>
.ai-stream {
  min-width: 0;
  padding: 0.75rem 0;
  color: var(--text);
  text-align: left;
}

.stream-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.indicator {
  width: 1.25rem;
  height: 1.25rem;
}

.model-id {
  overflow-wrap: anywhere;
}

.stream-text {
  margin: 0.75rem 0 0;
  padding: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  line-height: 1.6;
}
</style>