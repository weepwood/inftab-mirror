<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Search } from '@lucide/vue'
import { engines, searchModes } from '../data/defaults'
import type { EngineId, SearchMode } from '../types'

const props = defineProps<{
  modelValue: string
  engine: EngineId
  mode: SearchMode
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:engine': [value: EngineId]
  'update:mode': [value: SearchMode]
  search: []
}>()

const showEngines = ref(false)
const selectedEngine = computed(() => engines.find((item) => item.id === props.engine) ?? engines[0]!)
const baseUrl = import.meta.env.BASE_URL
</script>

<template>
  <section class="search-area" aria-label="站内搜索">
    <nav class="search-tabs" aria-label="搜索类型">
      <button
        v-for="item in searchModes"
        :key="item.id"
        type="button"
        class="search-tab"
        :class="{ active: mode === item.id }"
        @click="emit('update:mode', item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <form class="search-box" @submit.prevent="emit('search')">
      <button
        class="engine-picker"
        type="button"
        :aria-label="`当前搜索引擎：${selectedEngine.label}`"
        aria-haspopup="listbox"
        :aria-expanded="showEngines"
        @click="showEngines = !showEngines"
      >
        <img class="engine-logo" :src="`${baseUrl}search-engines/${selectedEngine.logo}`" :alt="selectedEngine.label" />
        <ChevronDown :size="14" />
      </button>
      <input
        :value="modelValue"
        type="search"
        autocomplete="off"
        placeholder="输入并搜索"
        aria-label="输入并搜索"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button class="submit-search" type="submit" aria-label="搜索"><Search :size="18" /></button>

      <div v-if="showEngines" class="engine-menu" role="listbox" aria-label="选择搜索引擎">
        <button
          v-for="item in engines"
          :key="item.id"
          type="button"
          role="option"
          :aria-selected="engine === item.id"
          @click="emit('update:engine', item.id); showEngines = false"
        >
          <img class="engine-logo" :src="`${baseUrl}search-engines/${item.logo}`" alt="" />
          {{ item.label }}
          <span v-if="engine === item.id" class="engine-check">✓</span>
        </button>
      </div>
    </form>
  </section>
</template>
