import { expect, it } from 'vitest'
import { defaultPreferences } from './defaults'
import { createLayoutDraft, layoutSignature, moveWidget } from './layoutEditor'
it('isolates drafts from global settings and existing workspace', () => {
  const workspace = { id:'work',name:'Work',itemIds:[],layout:{columns:3} }
  const preferences = {...defaultPreferences, homeWidgetIds: ['todo-summary'] as const}
  const global = {...preferences, homeWidgetIds: [...preferences.homeWidgetIds]}
  const draft = createLayoutDraft(workspace, global)
  draft.layout.columns = 8
  draft.widgetIds.push('notes-summary')
  draft.widgetSizes['todo-summary'] = 'full'
  expect(workspace.layout.columns).toBe(3)
  expect(global.homeWidgetIds).toEqual(['todo-summary'])
  expect(draft.baseline).toBe(layoutSignature(workspace, global))
  expect(moveWidget(draft.widgetIds,'notes-summary',-1)).toEqual(['notes-summary','todo-summary'])
})
