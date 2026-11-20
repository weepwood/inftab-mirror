<script setup lang="ts" generic="T extends string | number">
import { ChevronDown } from '@lucide/vue'

// Keep the native select's labeling, form behavior, IME and keyboard support.
// CSS progressively enhances its picker into a themed, top-layer menu.
defineOptions({ inheritAttrs: false })
const value = defineModel<T>()

function guardPickerEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  try {
    // Let the browser dismiss only this top-layer picker, not its parent dialog.
    if ((event.currentTarget as HTMLSelectElement).matches(':open')) event.stopPropagation()
  } catch { /* Older native pickers consume Escape without the :open selector. */ }
}
</script>

<template>
  <span class="select-field">
    <select v-model="value" class="ui-select" v-bind="$attrs" @keydown="guardPickerEscape"><slot /></select>
    <ChevronDown class="select-chevron" :size="15" :stroke-width="1.8" aria-hidden="true" />
  </span>
</template>
