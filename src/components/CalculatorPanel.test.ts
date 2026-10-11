// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CalculatorPanel from './CalculatorPanel.vue'

describe('CalculatorPanel', () => {
  it('previews and evaluates expressions with arithmetic precedence', async () => {
    const wrapper = mount(CalculatorPanel)
    const input = wrapper.get('input')
    await input.setValue('(2 + 3) * 4')

    expect(wrapper.get('output').text()).toBe('= 20')
    await input.trigger('keydown.enter')
    expect((input.element as HTMLInputElement).value).toBe('20')
  })

  it('supports keypad editing and does not execute unsupported expressions', async () => {
    const wrapper = mount(CalculatorPanel)
    await wrapper.get('button[aria-label="7"]').trigger('click')
    await wrapper.get('button[aria-label="+"]').trigger('click')
    await wrapper.get('button[aria-label="5"]').trigger('click')
    expect(wrapper.get('output').text()).toBe('= 12')
    await wrapper.get('button[aria-label="删除一位"]').trigger('click')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('7+')
    await wrapper.get('input').setValue('window.alert(1)')
    expect(wrapper.get('output').text()).toBe('输入算式开始计算')
  })
})
