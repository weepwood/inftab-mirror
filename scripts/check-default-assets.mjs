import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const defaultsPath = resolve(projectRoot, 'src/data/defaults.ts')
const iconDirectory = resolve(projectRoot, 'public/inftab-icons')
const source = readFileSync(defaultsPath, 'utf8')
const referencedIcons = [...source.matchAll(/icon: '([^']+)'/g)].map((match) => match[1])
const missingIcons = referencedIcons.filter((icon) => !existsSync(resolve(iconDirectory, icon)))

if (missingIcons.length) {
  console.error(`Default launcher icons are missing from public/inftab-icons/:\n${missingIcons.map((icon) => `- ${icon}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Default launcher assets check passed: ${referencedIcons.length} icon references resolve.`)
}
