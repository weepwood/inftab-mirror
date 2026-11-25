// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe,it,expect } from 'vitest'
import RangeField from './RangeField.vue'
describe('RangeField',()=>{
 it('converts display units and clamps to the range step',async()=>{
  const wrapper=mount(RangeField,{props:{label:'暗度',modelValue:.24,min:0,max:.65,step:.05,scale:100,unit:'%'}})
  const number=wrapper.get<HTMLInputElement>('input[type=number]')
  expect(number.element.value).toBe('24')
  await number.setValue('33')
  expect(wrapper.emitted('update:modelValue')).toEqual([[.35]])
  await number.setValue('100')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([.65])
  await number.setValue('')
  expect(number.element.value).toBe('24')
 })
 it('resets drafts on Escape, and mirrors slider updates and disabled state',async()=>{
  const wrapper=mount(RangeField,{props:{label:'大小',modelValue:48,min:32,max:60,step:2}})
  const number=wrapper.get<HTMLInputElement>('input[type=number]')
  number.element.value='55'
  await number.trigger('keydown',{key:'Escape'})
  expect(number.element.value).toBe('48')
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  await wrapper.get<HTMLInputElement>('input[type=range]').setValue('52')
  expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([52])
  await wrapper.setProps({modelValue:52,disabled:true})
  expect(number.element.value).toBe('52')
  expect(number.element.disabled).toBe(true)
  expect(wrapper.get<HTMLInputElement>('input[type=range]').element.disabled).toBe(true)
 })
})
