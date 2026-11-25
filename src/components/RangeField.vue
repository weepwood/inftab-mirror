<script setup lang="ts">
const props=withDefaults(defineProps<{label:string;modelValue:number;min:number;max:number;step:number;unit?:string;scale?:number;disabled?:boolean}>(),{unit:'',scale:1})
const emit=defineEmits<{'update:modelValue':[value:number]}>()
const display=()=>Number((props.modelValue*props.scale).toFixed(6))
function commit(e:Event){
 const input=e.target as HTMLInputElement
 const raw=input.valueAsNumber
 if(!Number.isFinite(raw)||raw===display()){input.value=String(display());return}
 const value=Number(Math.max(props.min,Math.min(props.max,props.min+Math.round((raw/props.scale-props.min)/props.step)*props.step)).toFixed(6))
 input.value=String(Number((value*props.scale).toFixed(6)))
 if(!props.disabled&&value!==props.modelValue)emit('update:modelValue',value)
}
function keys(e:KeyboardEvent){
 if(e.isComposing)return
 if(e.key==='Escape'){e.stopPropagation();e.preventDefault();(e.target as HTMLInputElement).value=String(display())}
 if(e.key==='Enter'){e.preventDefault();commit(e)}
}
</script>
<template>
 <div class="range-label">
  <span>{{label}}</span>
  <input :aria-label="label" type="range" :min="min" :max="max" :step="step" :value="modelValue" :disabled="disabled" @input="emit('update:modelValue',Number(($event.target as HTMLInputElement).value))"/>
  <span class="range-number"><input type="number" :aria-label="label+'精确值'+(unit?'（'+unit+'）':'')" :min="min*scale" :max="max*scale" :step="step*scale" :value="display()" :disabled="disabled" @change="commit" @keydown="keys"/><span v-if="unit" aria-hidden="true">{{unit}}</span></span>
 </div>
</template>
