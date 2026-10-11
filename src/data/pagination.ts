export type PageNavigationItem =
  | { kind: 'page'; page: number }
  | { kind: 'ellipsis'; id: string }

const maxVisiblePages = 9
const neighborRadius = 2

export function getPageNavigation(pageCount: number, currentPage: number): PageNavigationItem[] {
  const count = Number.isFinite(pageCount) ? Math.max(0, Math.floor(pageCount)) : 0
  if (count <= maxVisiblePages) {
    return Array.from({ length: count }, (_, page) => ({ kind: 'page', page }))
  }

  const current = Number.isFinite(currentPage)
    ? Math.min(count - 1, Math.max(0, Math.floor(currentPage)))
    : 0
  const visiblePages = new Set([0, count - 1])
  for (let page = Math.max(1, current - neighborRadius); page <= Math.min(count - 2, current + neighborRadius); page += 1) {
    visiblePages.add(page)
  }

  const sortedPages = [...visiblePages].sort((left, right) => left - right)
  return sortedPages.flatMap((page, index) => {
    const previousPage = sortedPages[index - 1]
    const gap = previousPage !== undefined && page - previousPage > 1
      ? [{ kind: 'ellipsis' as const, id: `gap-${previousPage}-${page}` }]
      : []
    return [...gap, { kind: 'page' as const, page }]
  })
}
