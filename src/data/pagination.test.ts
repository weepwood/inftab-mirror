import { describe, expect, it } from 'vitest'
import { getPageNavigation } from './pagination'

describe('page navigation', () => {
  it('shows every page while the navigation remains compact', () => {
    expect(getPageNavigation(3, 1)).toEqual([
      { kind: 'page', page: 0 },
      { kind: 'page', page: 1 },
      { kind: 'page', page: 2 },
    ])
  })

  it('keeps both ends and a five-page window around a deep page', () => {
    expect(getPageNavigation(60, 30)).toEqual([
      { kind: 'page', page: 0 },
      { kind: 'ellipsis', id: 'gap-0-28' },
      { kind: 'page', page: 28 },
      { kind: 'page', page: 29 },
      { kind: 'page', page: 30 },
      { kind: 'page', page: 31 },
      { kind: 'page', page: 32 },
      { kind: 'ellipsis', id: 'gap-32-59' },
      { kind: 'page', page: 59 },
    ])
  })

  it('keeps the navigation bounded near either edge and clamps invalid current pages', () => {
    expect(getPageNavigation(100_000, -4)).toHaveLength(5)
    expect(getPageNavigation(100_000, 100_004).map((item) => item.kind === 'page' ? item.page : item.kind)).toEqual([
      0, 'ellipsis', 99_997, 99_998, 99_999,
    ])
    expect(getPageNavigation(Number.NaN, 0)).toEqual([])
  })
})
