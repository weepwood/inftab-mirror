<script setup lang="ts">
import { computed, ref } from 'vue'
import { evaluateExpression } from '../data/calculator'

const expression = ref('')
const result = computed(() => {
  if (!expression.value.trim()) return ''
  try {
    const value = evaluateExpression(expression.value)
    return String(Object.is(value, -0) ? 0 : Number(value.toPrecision(12)))
  } catch {
    return ''
  }
})

const keys: { label: string; value: string; kind?: string; ariaLabel?: string }[] = [
  { label: '清空', value: 'clear', kind: 'utility' },
  { label: '⌫', value: 'backspace', kind: 'utility', ariaLabel: '删除一位' },
  { label: '(', value: '(' },
  { label: ')', value: ')' },
  { label: '7', value: '7' },
  { label: '8', value: '8' },
  { label: '9', value: '9' },
  { label: '÷', value: '/', kind: 'operator' },
  { label: '4', value: '4' },
  { label: '5', value: '5' },
  { label: '6', value: '6' },
  { label: '×', value: '*', kind: 'operator' },
  { label: '1', value: '1' },
  { label: '2', value: '2' },
  { label: '3', value: '3' },
  { label: '−', value: '-', kind: 'operator' },
  { label: '0', value: '0' },
  { label: '.', value: '.' },
  { label: '=', value: 'equals', kind: 'equals' },
  { label: '+', value: '+', kind: 'operator' },
]

function press(value: string) {
  if (value === 'clear') expression.value = ''
  else if (value === 'backspace') expression.value = expression.value.slice(0, -1)
  else if (value === 'equals') calculate()
  else expression.value += value
}

function calculate() {
  if (result.value) expression.value = result.value
}
</script>

<template>
  <div class="calculator-content">
    <label class="calculator-display">
      <span>表达式</span>
      <input v-model="expression" aria-label="计算表达式" inputmode="decimal" autocomplete="off" spellcheck="false" @keydown.enter.prevent="calculate" />
      <output aria-live="polite">{{ result ? `= ${result}` : '输入算式开始计算' }}</output>
    </label>
    <div class="calculator-keys" aria-label="计算器按键">
      <button
        v-for="key in keys"
        :key="key.value"
        type="button"
        :class="[`calculator-key-${key.kind ?? 'number'}`]"
        :aria-label="key.ariaLabel ?? key.label"
        @click="press(key.value)"
      >{{ key.label }}</button>
    </div>
    <p class="calculator-footnote">支持括号与四则运算；计算在本机完成。</p>
  </div>
</template>
