export const weatherHostPermissions = [
  'https://api.open-meteo.com/*',
  'https://geocoding-api.open-meteo.com/*',
] as const

interface ChromePermissionsApi {
  contains(details: { origins: string[] }): Promise<boolean>
  request(details: { origins: string[] }): Promise<boolean>
  onAdded?: ChromePermissionsEvent
  onRemoved?: ChromePermissionsEvent
}

interface ChromePermissionsEvent {
  addListener(listener: (details: { origins?: string[] }) => void): void
  removeListener(listener: (details: { origins?: string[] }) => void): void
}

interface ChromeWeatherApi {
  runtime?: { id?: string }
  permissions?: ChromePermissionsApi
}

function extensionApi(): ChromeWeatherApi | undefined {
  const api = (globalThis as typeof globalThis & { chrome?: ChromeWeatherApi }).chrome
  return api?.runtime?.id ? api : undefined
}

export async function hasWeatherPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api) return true
  return api.permissions?.contains({ origins: [...weatherHostPermissions] }) ?? false
}

export async function requestWeatherPermission(): Promise<boolean> {
  const api = extensionApi()
  if (!api) return true
  return api.permissions?.request({ origins: [...weatherHostPermissions] }) ?? false
}

export function subscribeToWeatherPermissionChanges(listener: () => void): () => void {
  const permissions = extensionApi()?.permissions
  if (!permissions) return () => {}
  const weatherOrigins = new Set<string>(weatherHostPermissions)
  const handleChange = (details: { origins?: string[] }) => {
    if (details.origins?.some((origin) => weatherOrigins.has(origin))) listener()
  }
  const events = [permissions.onAdded, permissions.onRemoved]
    .filter((event): event is ChromePermissionsEvent => Boolean(event))
  events.forEach((event) => event.addListener(handleChange))
  return () => events.forEach((event) => event.removeListener(handleChange))
}
