interface ChromeExtensionApi {
  runtime?: { id?: string }
  permissions?: {
    onAdded?: ChromeEvent
    onRemoved?: ChromeEvent
    request(details: { permissions: string[] }): Promise<boolean>
    contains(details: { permissions: string[] }): Promise<boolean>
  }
}

interface ChromeEvent {
  addListener(listener: (...args: unknown[]) => void): void
  removeListener(listener: (...args: unknown[]) => void): void
}

async function requestOptionalPermission(permission: 'tabs' | 'topSites'): Promise<boolean> {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  if (!api?.runtime?.id || !api.permissions) return false
  return api.permissions.request({ permissions: [permission] })
}

export async function requestBrowserTabsPermission(): Promise<boolean> {
  return requestOptionalPermission('tabs')
}

export async function requestMostVisitedSitesPermission(): Promise<boolean> {
  return requestOptionalPermission('topSites')
}

export async function hasMostVisitedSitesPermission(): Promise<boolean> {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  if (!api?.runtime?.id || !api.permissions) return false
  return api.permissions.contains({ permissions: ['topSites'] })
}

export function subscribeToMostVisitedSitesPermissionChanges(listener: () => void): () => void {
  const permissions = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome?.permissions
  if (!permissions) return () => {}
  const handleChange = (details: unknown) => {
    if (typeof details !== 'object' || details === null || !('permissions' in details)) return
    if (Array.isArray(details.permissions) && details.permissions.includes('topSites')) listener()
  }
  const events = [permissions.onAdded, permissions.onRemoved].filter((event): event is ChromeEvent => Boolean(event))
  events.forEach((event) => event.addListener(handleChange))
  return () => events.forEach((event) => event.removeListener(handleChange))
}
