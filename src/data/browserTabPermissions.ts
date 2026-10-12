interface ChromeExtensionApi {
  runtime?: { id?: string }
  permissions?: {
    request(details: { permissions: string[] }): Promise<boolean>
  }
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
