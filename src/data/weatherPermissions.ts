export const weatherHostPermissions = [
  'https://api.open-meteo.com/*',
  'https://geocoding-api.open-meteo.com/*',
] as const

interface ChromePermissionsApi {
  contains(details: { origins: string[] }): Promise<boolean>
  request(details: { origins: string[] }): Promise<boolean>
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
