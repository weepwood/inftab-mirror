<script setup lang="ts">
import type { LauncherItem } from '../types'

defineProps<{ items: LauncherItem[] }>()
const emit = defineEmits<{ open: [item: LauncherItem] }>()
</script>

<template>
  <nav v-if="items.length" class="home-dock" aria-label="常驻 Dock">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="home-dock-item"
      :data-dock-item-id="item.id"
      :aria-label="`打开${item.title}`"
      :title="item.title"
      @click="emit('open', item)"
    >
      <span class="home-dock-icon" :style="{ backgroundColor: item.color }">
        <img v-if="item.icon" :src="item.icon" alt="" />
        <span v-else>{{ item.mark }}</span>
      </span>
      <span class="home-dock-label">{{ item.title }}</span>
    </button>
  </nav>
</template>
