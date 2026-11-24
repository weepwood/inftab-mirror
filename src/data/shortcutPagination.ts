export function splitShortcutPages<T>(items: readonly T[], pageSize: number): T[][] {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) return []
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += pageSize) pages.push(items.slice(index, index + pageSize))
  return pages
}

export function reservedShortcutRows(count: number, columns: number, rows: number) {
  return Math.min(rows, Math.max(1, Math.ceil(count / columns)))
}
