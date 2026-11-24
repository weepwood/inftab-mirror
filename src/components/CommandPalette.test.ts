// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import CommandPalette from './CommandPalette.vue'

it('filters, selects and executes commands from the keyboard', async () => {
  const wrapper = mount(CommandPalette, { attachTo: document.body })
  try {
    const input = wrapper.get('input')
    await input.setValue('theme')
    expect(wrapper.findAll('[role=option]')).toHaveLength(3)
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('[aria-selected=true]').text()).toContain('深色')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('run')).toEqual([['dark']])
    await input.setValue('unknown-command')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('run')).toHaveLength(1)
    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  } finally { wrapper.unmount() }
})
