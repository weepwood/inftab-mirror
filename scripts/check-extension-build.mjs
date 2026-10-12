import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const sourceManifestPath = fileURLToPath(new URL('../public/manifest.json', import.meta.url))
const manifestPath = resolve(packageRoot, 'manifest.json')

function fail(message) {
  console.error(`Extension package check failed: ${message}`)
  process.exitCode = 1
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${label} is missing or invalid (${error instanceof Error ? error.message : String(error)}).`)
    return undefined
  }
}

if (!existsSync(manifestPath)) {
  fail('dist/manifest.json is missing; the unpacked Chrome extension cannot load.')
  process.exit(1)
}

const manifest = readJson(manifestPath, 'dist/manifest.json')
const sourceManifest = readJson(sourceManifestPath, 'public/manifest.json')
if (!manifest || !sourceManifest) process.exit(1)

if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) fail('the packaged manifest does not match public/manifest.json.')
if (manifest.manifest_version !== 3) fail('manifest_version must be 3.')
if (typeof manifest.name !== 'string' || !manifest.name.trim()) fail('the extension name is missing.')
if (typeof manifest.version !== 'string' || !/^\d+(?:\.\d+){0,3}$/.test(manifest.version)) fail('the extension version is invalid.')
if (manifest.chrome_url_overrides?.newtab !== 'index.html') fail('the new-tab override must point to index.html.')

const allowedHosts = [
  'https://api.open-meteo.com/*',
  'https://geocoding-api.open-meteo.com/*',
]
const hostPermissions = manifest.host_permissions ?? []
if (JSON.stringify(hostPermissions) !== JSON.stringify(allowedHosts)) {
  fail(`host_permissions must stay limited to the weather APIs (${allowedHosts.join(', ')}).`)
}
for (const permissionField of ['permissions', 'optional_permissions']) {
  const permissions = manifest[permissionField]
  if (permissionField === 'optional_permissions') {
    if (!Array.isArray(permissions) || JSON.stringify(permissions) !== JSON.stringify(['bookmarks', 'clipboardWrite', 'history', 'tabs'])) {
      fail('optional_permissions must contain only the opt-in bookmarks, clipboard, browsing history, and current-window tab import features.')
    }
    continue
  }
  if (permissions !== undefined && (!Array.isArray(permissions) || permissions.length > 0)) {
    fail(`${permissionField} must be absent or empty; unexpected permissions: ${Array.isArray(permissions) ? permissions.join(', ') : 'invalid value'}.`)
  }
}

function resolvePackageFile(relativePath, label) {
  if (typeof relativePath !== 'string' || !relativePath || isAbsolute(relativePath)) {
    fail(`${label} must use a relative package path.`)
    return
  }
  const path = resolve(packageRoot, relativePath)
  const fromRoot = relative(packageRoot, path)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    fail(`${label} escapes the extension package directory.`)
    return
  }
  if (!existsSync(path)) fail(`${label} points to missing file dist/${relativePath}.`)
}

resolvePackageFile(manifest.chrome_url_overrides?.newtab, 'chrome_url_overrides.newtab')
const htmlPath = resolve(packageRoot, 'index.html')
if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, 'utf8')
  const localAssets = [...html.matchAll(/(?:src|href)="(\.\/[^"#?]+)"/g)].map((match) => match[1])
  if (localAssets.length === 0) fail('index.html has no packaged JavaScript or CSS entry points.')
  for (const asset of localAssets) resolvePackageFile(asset.slice(2), 'index.html asset')
}

if (process.exitCode !== 1) console.log('Extension package check passed: Manifest V3, new-tab entry, local assets, weather hosts, and optional bookmarks, clipboard, and browsing history access are valid.')
