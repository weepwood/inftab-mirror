<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChevronDown, Search } from '@lucide/vue'
import { engines, searchModes } from '../data/defaults'
import type { EngineId, SearchMode } from '../types'

const props = defineProps<{
  modelValue: string
  engine: EngineId
  mode: SearchMode
  visibleModes: SearchMode[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:engine': [value: EngineId]
  'update:mode': [value: SearchMode]
  search: []
}>()

const showEngines = ref(false)
const selectedEngine = computed(() => engines.find((item) => item.id === props.engine) ?? engines[0]!)
const activeModes = computed(() => searchModes.filter((item) => props.visibleModes.includes(item.id)))
const baseUrl = import.meta.env.BASE_URL
const searchBox = ref<HTMLElement>()
const engineMenu = ref<HTMLElement>()
const engineMenuPosition = ref({ top: 0, left: 0 })
const searchInput = ref<HTMLInputElement>()

function focusSearch() {
  searchInput.value?.focus()
}

function toggleEngines() {
  if (showEngines.value) {
    showEngines.value = false
    return
  }
  const bounds = searchBox.value?.getBoundingClientRect()
  if (bounds) engineMenuPosition.value = { top: bounds.bottom + 8, left: bounds.left + 8 }
  showEngines.value = true
}

function closeOnOutsidePointer(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || searchBox.value?.contains(target) || engineMenu.value?.contains(target)) return
  showEngines.value = false
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') showEngines.value = false
}

onMounted(() => {
  window.addEventListener('pointerdown', closeOnOutsidePointer)
  window.addEventListener('keydown', closeOnEscape)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', closeOnOutsidePointer)
  window.removeEventListener('keydown', closeOnEscape)
})

defineExpose({ focusSearch })
</script>

<template>
  <section class="search-area" aria-label="站内搜索">
    <nav v-if="activeModes.length" class="search-tabs" aria-label="搜索类型">
      <button
        v-for="item in activeModes"
        :key="item.id"
        type="button"
        class="search-tab"
        :class="{ active: mode === item.id }"
        @click="emit('update:mode', item.id)"
      >
        {{ item.label }}
      </button>
    </nav>

    <form ref="searchBox" class="search-box" @submit.prevent="emit('search')">
      <button
        class="engine-picker"
        type="button"
        :aria-label="`当前搜索引擎：${selectedEngine.label}`"
        aria-haspopup="listbox"
        :aria-expanded="showEngines"
        @click="toggleEngines"
      >
        <img class="engine-logo" :src="`${baseUrl}search-engines/${selectedEngine.logo}`" :alt="selectedEngine.label" />
        <ChevronDown :size="14" />
      </button>
      <input
        ref="searchInput"
        :value="modelValue"
        type="search"
        autocomplete="off"
        placeholder="输入并搜索"
        aria-label="输入并搜索"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button class="submit-search" type="submit" aria-label="搜索"><Search :size="18" /></button>
    </form>
    <Teleport to="body">
      <Transition name="engine-menu">
        <div v-if="showEngines" ref="engineMenu" class="engine-menu" role="listbox" aria-label="选择搜索引擎" :style="{ top: `${engineMenuPosition.top}px`, left: `${engineMenuPosition.left}px` }">
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
      </Transition>
    </Teleport>
  </section>
</template>
