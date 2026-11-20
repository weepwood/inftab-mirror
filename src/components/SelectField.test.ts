// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectField from './SelectField.vue'

let wrapper: VueWrapper | undefined
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

describe('shared native select field', () => {
  it('forwards accessible names, IDs and form attributes to the actual select, not the shell', async () => {
    wrapper = mount(SelectField, {
      props: { modelValue: 'light' },
      attrs: { id: 'theme', name: 'theme', 'aria-label': '颜色主题', required: true },
      slots: { default: '<option value="light">浅色</option><option value="dark">深色</option>' },
    })
    const select = wrapper.get('select')
    expect(select.attributes()).toMatchObject({ id: 'theme', name: 'theme', 'aria-label': '颜色主题', required: '' })
    expect(wrapper.get('.select-field').attributes('aria-label')).toBeUndefined()
    expect(wrapper.get('.select-chevron').attributes('aria-hidden')).toBe('true')
    expect((select.element as HTMLSelectElement).value).toBe('light')
    await select.setValue('dark')
    expect(wrapper.emitted('update:modelValue')).toEqual([['dark']])
  })

  it('preserves numeric option values and a disabled control', async () => {
    wrapper = mount(SelectField, {
      props: { modelValue: 25 },
      attrs: { disabled: true, 'aria-label': '专注时长' },
      slots: { default: '<option :value="15">15 分钟</option><option :value="25">25 分钟</option>' },
    })
    const select = wrapper.get('select')
    expect((select.element as HTMLSelectElement).disabled).toBe(true)
    await wrapper.setProps({ disabled: false })
    await select.setValue('15')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([15])
  })

  it.each([true, false])('consumes Escape only when its native picker is open: %s', async (open) => {
    const onKeydown = vi.fn()
    wrapper = mount(SelectField, {
      props: { modelValue: 'a' },
      slots: { default: '<option value="a">A</option>' },
    })
    const select = wrapper.get('select')
    vi.spyOn(select.element, 'matches').mockImplementation((selector) => selector === ':open' && open)
    wrapper.element.addEventListener('keydown', onKeydown)
    await select.trigger('keydown', { key: 'Escape' })
    expect(onKeydown).toHaveBeenCalledTimes(open ? 0 : 1)
  })

  it('keeps native keyboard fallback usable without the modern :open selector', async () => {
    wrapper = mount(SelectField, { props: { modelValue: 'a' }, slots: { default: '<option value="a">A</option>' } })
    const select = wrapper.get('select')
    vi.spyOn(select.element, 'matches').mockImplementation(() => { throw new DOMException('Unsupported selector') })
    await expect(select.trigger('keydown', { key: 'Escape' })).resolves.not.toThrow()
  })
})
