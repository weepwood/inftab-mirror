<script setup lang="ts">
import { computed } from 'vue'
import type { TodoItem } from '../types'

const props = defineProps<{ items: TodoItem[] }>()
const openItems = computed(() => props.items.filter((item) => !item.done))
const previewItems = computed(() => openItems.value.slice(0, 2))
</script>

<template>
  <div class="home-widget-summary" aria-label="待办预览">
    <p class="home-widget-metric">{{ openItems.length ? `还有 ${openItems.length} 项待完成` : '今天没有待办' }}</p>
    <ul v-if="previewItems.length" class="home-widget-preview">
      <li v-for="item in previewItems" :key="item.id">{{ item.title }}</li>
    </ul>
    <p v-else class="home-widget-empty">添加一项任务，开始安排今天。</p>
  </div>
</template>
