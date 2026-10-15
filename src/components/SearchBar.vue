<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronDown, Search } from '@lucide/vue'
import { engines, searchModes } from '../data/defaults'
import type { CustomSearchEngine, SearchEngineSelection, SearchMode } from '../types'

const props = withDefaults(defineProps<{
  modelValue: string
  engine: SearchEngineSelection
  mode: SearchMode
  visibleModes: SearchMode[]
  customEngines?: CustomSearchEngine[]
  darkTheme?: boolean
  localSearch?: boolean
}>(), { customEngines: () => [], darkTheme: false, localSearch: false })

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:engine': [value: SearchEngineSelection]
  'update:mode': [value: SearchMode]
  search: []
  translate: []
}>()

const showEngines = ref(false)
const translationError = ref(false)
const availableEngines = computed(() => [
  ...engines,
  ...props.customEngines.map((item) => ({ id: `custom:${item.id}` as const, label: item.name, mark: Array.from(item.name)[0] ?? '' })),
])
const selectedEngine = computed(() => availableEngines.value.find((item) => item.id === props.engine) ?? availableEngines.value[0]!)
const activeModes = computed(() => props.engine.startsWith('custom:') ? [] : searchModes.filter((item) => props.visibleModes.includes(item.id)))
const baseUrl = import.meta.env.BASE_URL
const searchBox = ref<HTMLElement>()
const engineMenu = ref<HTMLElement>()
const enginePicker = ref<HTMLButtonElement>()
const engineMenuPosition = ref({ top: 0, left: 0, maxHeight: 0 })
const searchInput = ref<HTMLInputElement>()
const isComposingSearchQuery = ref(false)
let ignoreCompositionSubmit: boolean = false
let compositionSubmitGuardTimer: number | undefined

function focusSearch() {
  searchInput.value?.focus()
}

function requestTranslation() {
  translationError.value = false
  emit('translate')
}

function showTranslationError() {
  translationError.value = true
}

function updateEngineMenuPosition() {
  const bounds = searchBox.value?.getBoundingClientRect()
  if (!bounds) return
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const belowTop = Math.min(viewportHeight - 8, bounds.bottom + 8)
  const belowSpace = Math.max(0, viewportHeight - belowTop - 8)
  const aboveSpace = Math.max(0, bounds.top - 16)
  const menuHeight = engineMenu.value?.scrollHeight || availableEngines.value.length * 42 + 2
  const openAbove = menuHeight > belowSpace && aboveSpace > belowSpace
  const availableSpace = openAbove ? aboveSpace : belowSpace
  const maxHeight = Math.min(menuHeight, availableSpace)
  const top = openAbove ? Math.max(8, bounds.top - 8 - maxHeight) : belowTop
  const maxLeft = Math.max(8, viewportWidth - 198)
  const left = Math.min(Math.max(8, bounds.left + 8), maxLeft)
  engineMenuPosition.value = { top, left, maxHeight }
}

function toggleEngines() {
  if (showEngines.value) {
    showEngines.value = false
    return
  }
  updateEngineMenuPosition()
  showEngines.value = true
  void nextTick(() => {
    updateEngineMenuPosition()
    focusSelectedEngine()
  })
}

function engineOptions() {
  return [...(engineMenu.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
}

function focusSelectedEngine() {
  const index = availableEngines.value.findIndex((item) => item.id === props.engine)
  engineOptions()[Math.max(0, index)]?.focus()
}

function closeEngineMenu(restoreFocus = false) {
  showEngines.value = false
  if (restoreFocus) void nextTick(() => enginePicker.value?.focus())
}

function handleLocalSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && (isComposingSearchQuery.value || event.isComposing || event.keyCode === 229)) {
    // Some browsers submit the surrounding form when Enter confirms an IME
    // candidate. Ignore only the default submit from this key event.
    ignoreCompositionSubmit = true
    if (compositionSubmitGuardTimer !== undefined) window.clearTimeout(compositionSubmitGuardTimer)
    compositionSubmitGuardTimer = window.setTimeout(() => {
      ignoreCompositionSubmit = false
      compositionSubmitGuardTimer = undefined
    }, 0)
  }
  if (props.localSearch && event.key === 'ArrowDown') {
    const firstResult = document.querySelector<HTMLButtonElement>('.local-search-result')
    if (firstResult) {
      event.preventDefault()
      firstResult.focus()
    }
  }
}

function handleSearchSubmit() {
  if (ignoreCompositionSubmit) {
    ignoreCompositionSubmit = false
    if (compositionSubmitGuardTimer !== undefined) window.clearTimeout(compositionSubmitGuardTimer)
    compositionSubmitGuardTimer = undefined
    return
  }
  emit('search')
}

function handleEngineOptionKeydown(event: KeyboardEvent) {
  const options = engineOptions()
  const index = options.indexOf(event.currentTarget as HTMLButtonElement)
  let nextIndex: number | undefined
  if (event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
  else if (event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
  else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = options.length - 1
  else if (event.key === 'Escape') {
    event.preventDefault()
    closeEngineMenu(true)
    return
  } else if (event.key === 'Tab') {
    event.preventDefault()
    closeEngineMenu()
    void nextTick(() => (event.shiftKey ? enginePicker.value : searchInput.value)?.focus())
    return
  }
  if (nextIndex === undefined) return
  event.preventDefault()
  options[nextIndex]?.focus()
}

function handleModeKeydown(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !activeModes.value.length) return
  event.preventDefault()
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? activeModes.value.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + activeModes.value.length) % activeModes.value.length
  const mode = activeModes.value[nextIndex]
  if (!mode) return
  emit('update:mode', mode.id)
  void nextTick(() => {
    const tabs = searchBox.value?.previousElementSibling?.querySelectorAll<HTMLButtonElement>('.search-tab')
    tabs?.[nextIndex]?.focus()
  })
}

function closeOnOutsidePointer(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || searchBox.value?.contains(target) || engineMenu.value?.contains(target)) return
  showEngines.value = false
}

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && showEngines.value) closeEngineMenu(true)
}

onMounted(() => {
  window.addEventListener('pointerdown', closeOnOutsidePointer)
  window.addEventListener('keydown', closeOnEscape)
})
onBeforeUnmount(() => {
  if (compositionSubmitGuardTimer !== undefined) window.clearTimeout(compositionSubmitGuardTimer)
  window.removeEventListener('pointerdown', closeOnOutsidePointer)
  window.removeEventListener('keydown', closeOnEscape)
  window.removeEventListener('resize', updateEngineMenuPosition)
  window.removeEventListener('scroll', updateEngineMenuPosition, true)
})
watch(() => props.localSearch, (enabled) => {
  if (enabled) closeEngineMenu()
})
watch(showEngines, (isOpen) => {
  if (isOpen) {
    window.addEventListener('resize', updateEngineMenuPosition)
    window.addEventListener('scroll', updateEngineMenuPosition, true)
  } else {
    window.removeEventListener('resize', updateEngineMenuPosition)
    window.removeEventListener('scroll', updateEngineMenuPosition, true)
  }
})

defineExpose({ focusSearch, showTranslationError })
</script>

<template>
  <section class="search-area" :class="{ 'local-search-mode': localSearch }" aria-label="站内搜索">
    <nav v-if="activeModes.length && !localSearch" class="search-tabs" role="group" aria-label="搜索类型">
      <button
        v-for="item in activeModes"
        :key="item.id"
        type="button"
        class="search-tab"
        :class="{ active: mode === item.id }"
        :aria-pressed="mode === item.id"
        @click="emit('update:mode', item.id)"
        @keydown="handleModeKeydown($event, activeModes.indexOf(item))"
      >
        {{ item.label }}
      </button>
    </nav>

    <form ref="searchBox" class="search-box" @submit.prevent="handleSearchSubmit">
      <button
        ref="enginePicker"
        class="engine-picker"
        type="button"
        v-if="!localSearch"
        :aria-label="`当前搜索引擎：${selectedEngine.label}`"
        aria-haspopup="listbox"
        :aria-expanded="showEngines"
        @click="toggleEngines"
      >
        <img v-if="'logo' in selectedEngine" class="engine-logo" :src="`${baseUrl}search-engines/${selectedEngine.logo}`" :alt="selectedEngine.label" />
        <span v-else class="engine-initial" aria-hidden="true">{{ selectedEngine.mark }}</span>
        <ChevronDown :size="14" />
      </button>
      <input
        ref="searchInput"
        :value="modelValue"
        type="search"
        autocomplete="off"
        :placeholder="localSearch ? '搜索快捷入口名称或网址' : '输入并搜索'"
        :aria-label="localSearch ? '搜索快捷入口名称或网址' : '输入并搜索'"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @compositionstart="isComposingSearchQuery = true"
        @compositionend="isComposingSearchQuery = false"
        @keydown="handleLocalSearchKeydown"
      />
      <button v-if="!localSearch" class="quick-translate" type="button" :disabled="!modelValue.trim()" aria-label="翻译成简体中文" title="翻译成简体中文" @click="requestTranslation">译</button>
      <button class="submit-search" type="submit" :aria-label="localSearch ? '打开第一个匹配的快捷入口' : '搜索'"><Search :size="18" /></button>
    </form>
    <p v-if="translationError" class="search-action-error" role="status" aria-live="polite">翻译工具暂时无法加载，请重试。</p>
    <slot v-if="localSearch" name="local-results" />
    <Teleport to="body">
      <Transition name="engine-menu">
        <div v-if="showEngines" ref="engineMenu" class="engine-menu" :class="{ 'theme-dark': darkTheme }" role="listbox" aria-label="选择搜索引擎" :style="{ top: `${engineMenuPosition.top}px`, left: `${engineMenuPosition.left}px`, maxHeight: `${engineMenuPosition.maxHeight}px` }">
          <button
            v-for="item in availableEngines"
            :key="item.id"
            type="button"
            role="option"
            :aria-selected="engine === item.id"
            @click="emit('update:engine', item.id); closeEngineMenu(true)"
            @keydown="handleEngineOptionKeydown"
          >
            <img v-if="'logo' in item" class="engine-logo" :src="`${baseUrl}search-engines/${item.logo}`" alt="" />
            <span v-else class="engine-initial" aria-hidden="true">{{ item.mark }}</span>
            {{ item.label }}
            <span v-if="engine === item.id" class="engine-check">✓</span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
