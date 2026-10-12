interface ChromeExtensionApi {
  runtime?: { id?: string }
  permissions?: {
    request(details: { permissions: string[] }): Promise<boolean>
  }
}

export async function requestBrowserTabsPermission(): Promise<boolean> {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeExtensionApi }).chrome
  if (!api?.runtime?.id || !api.permissions) return false
  return api.permissions.request({ permissions: ['tabs'] })
}
