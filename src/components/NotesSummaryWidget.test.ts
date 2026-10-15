// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import NotesSummaryWidget from './NotesSummaryWidget.vue'

describe('NotesSummaryWidget', () => {
  it('truncates the preview without splitting an emoji', () => {
    const wrapper = mount(NotesSummaryWidget, {
      props: {
        notes: [{ id: 'note', title: 'Note', body: `${'x'.repeat(99)}😀tail`, updatedAt: 1 }],
        activeId: 'note',
      },
    })

    expect(wrapper.get('.home-widget-highlight').text()).toBe(`${'x'.repeat(99)}😀`)
  })
})
