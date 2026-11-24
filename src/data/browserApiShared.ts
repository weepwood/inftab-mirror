export interface ChromeEvent {
  addListener(listener: (...args: unknown[]) => void): void
  removeListener(listener: (...args: unknown[]) => void): void
}

export function extensionApi<T extends { runtime?: { id?: string } }>(): T | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: T }).chrome
  return api?.runtime?.id ? api : undefined
}

export function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

export function subscribeEvents(events: (ChromeEvent | undefined)[], listener: (...args: unknown[]) => void): () => void {
  const active = events.filter((event): event is ChromeEvent => Boolean(event))
  active.forEach(event => event.addListener(listener))
  return () => active.forEach(event => event.removeListener(listener))
}

export function subscribePermissionChanges(permissions: { onAdded?: ChromeEvent; onRemoved?: ChromeEvent } | undefined, permission: string, listener: () => void): () => void {
  if (!permissions) return () => {}
  return subscribeEvents([permissions.onAdded, permissions.onRemoved], details => {
    if (typeof details !== 'object' || details === null || !('permissions' in details)) return
    if (Array.isArray(details.permissions) && details.permissions.includes(permission)) listener()
  })
}
