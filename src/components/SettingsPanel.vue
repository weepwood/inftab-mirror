<script setup lang="ts">
import { wallpaperChoices } from '../data/defaults'
import type { Preferences } from '../types'

const props = defineProps<{ preferences: Preferences }>()
const emit = defineEmits<{ update: [value: Partial<Preferences>]; reset: []; addShortcut: [] }>()

function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  emit('update', { [key]: value } as Pick<Preferences, K>)
}
</script>

<template>
  <div class="settings-content">
    <section class="settings-section">
      <div class="section-heading">
        <div><h3>壁纸</h3><p>选择新标签页背景</p></div>
        <button class="text-button" type="button" @click="$emit('reset')">恢复默认</button>
      </div>
      <div class="wallpaper-options">
        <button
          v-for="choice in wallpaperChoices"
          :key="choice.value"
          class="wallpaper-option"
          :class="{ selected: preferences.wallpaper === choice.value }"
          :style="{ background: choice.preview }"
          type="button"
          :aria-label="choice.label"
          @click="update('wallpaper', choice.value); update('customWallpaper', '')"
        ><span>{{ choice.label }}</span></button>
      </div>
      <label class="field-label">自定义背景图片网址
        <input :value="preferences.customWallpaper" placeholder="https://example.com/wallpaper.jpg" @input="update('customWallpaper', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="range-label"><span>背景暗度</span><input type="range" min="0" max="0.65" step="0.05" :value="preferences.shade" @input="update('shade', Number(($event.target as HTMLInputElement).value))" /></label>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><h3>快捷入口</h3><p>调整图标网格外观</p></div></div>
      <button class="settings-add-shortcut" type="button" @click="emit('addShortcut')"><span>＋</span> 添加快捷入口</button>
      <label class="range-label"><span>每行图标</span><strong>{{ preferences.columns }}</strong><input type="range" min="4" max="8" step="1" :value="preferences.columns" @input="update('columns', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>图标大小</span><strong>{{ preferences.iconSize }} px</strong><input type="range" min="48" max="100" step="2" :value="preferences.iconSize" @input="update('iconSize', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="range-label"><span>圆角</span><strong>{{ preferences.iconRadius }} px</strong><input type="range" min="8" max="50" step="2" :value="preferences.iconRadius" @input="update('iconRadius', Number(($event.target as HTMLInputElement).value))" /></label>
      <label class="toggle-row"><span>显示网站名称</span><input type="checkbox" :checked="preferences.showNames" @change="update('showNames', ($event.target as HTMLInputElement).checked)" /></label>
    </section>
    <p class="local-hint">设置保存在这台设备的浏览器中。</p>
  </div>
</template>
