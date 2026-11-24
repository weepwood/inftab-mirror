<script setup lang="ts">
import { trapOverlayTab, isComposingKey } from '../composables/overlayFocus'
import { onMounted, ref } from 'vue'
import { X } from '@lucide/vue'

withDefaults(defineProps<{ title: string; description: string; confirmLabel?: string }>(), {
  confirmLabel: '确认删除',
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLElement>()
const cancelButton = ref<HTMLButtonElement>()

function handleKeydown(event: KeyboardEvent) {
  if (isComposingKey(event)) { event.stopPropagation(); return }
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }
  trapOverlayTab(event, dialog.value)
}
onMounted(() => cancelButton.value?.focus())
</script>

<template>
  <div class="modal-backdrop confirm-backdrop" @click.self="emit('cancel')">
    <section
      ref="dialog"
      class="shortcut-dialog confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      @keydown="handleKeydown"
    >
      <header>
        <h2 id="confirm-dialog-title">{{ title }}</h2>
        <button type="button" aria-label="取消操作" @click="emit('cancel')"><X :size="19" /></button>
      </header>
      <p id="confirm-dialog-description">{{ description }}</p>
      <footer>
        <button ref="cancelButton" class="button-secondary" type="button" @click="emit('cancel')">取消</button>
        <button class="button-primary confirm-danger" type="button" @click="emit('confirm')">{{ confirmLabel }}</button>
      </footer>
    </section>
  </div>
</template>
