<script setup lang="ts">
import { computed, watch } from 'vue'
import WindowFrame from './WindowFrame.vue'
import type { PanelId } from '../plugins/ids'
import type { PanelPluginContext } from '../plugins/registry'
import { panelPlugins, getPanelProps, getPanelListeners } from '../plugins/registry'

const props=defineProps<{panelId:PanelId; context:PanelPluginContext; active:boolean; minimized:boolean; maximized:boolean; cascade:number; layer:number; dark?:boolean; hidden?:boolean}>()
const emit=defineEmits<{activate:[];close:[];minimize:[];maximize:[];title:[title:string]}>()
const plugin=computed(()=>panelPlugins[props.panelId])
const panelProps=computed(()=>getPanelProps(props.panelId,props.context))
const listeners=computed(()=>getPanelListeners(props.panelId,props.context))
watch(()=>plugin.value.title,title=>emit('title',title),{immediate:true})
</script>
<template>
 <WindowFrame kind="tool" :title="plugin.title" :label="plugin.title" :description="plugin.description" :geometry-key="'tool:'+panelId" :active="active" :minimized="minimized" :maximized="maximized" :cascade="cascade" :layer="layer" :dark="dark" :hidden="hidden" @activate="emit('activate')" @close="emit('close')" @minimize="emit('minimize')" @maximize="emit('maximize')">
  <div class="tool-content"><component :is="plugin.component" v-bind="panelProps" v-on="listeners"/></div>
 </WindowFrame>
</template>
<style scoped>
.tool-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
</style>
