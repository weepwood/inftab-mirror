<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { X } from '@lucide/vue'

withDefaults(defineProps<{ title: string; description: string; confirmLabel?: string }>(), {
  confirmLabel: '确认删除',
})
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLElement>()
const cancelButton = ref<HTMLButtonElement>()

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button:not([disabled])')]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (!first || !last) {
    event.preventDefault()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
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
