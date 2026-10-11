import { readdirSync, statSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url))
const budgets = {
  javascriptGzip: 128 * 1024,
  javascriptEntryGzip: 60 * 1024,
  cssGzip: 64 * 1024,
  totalOutput: 4 * 1024 * 1024,
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(path) : [path]
  })
}

const files = collectFiles(outputDirectory)
const javascriptFiles = files.filter((path) => path.endsWith('.js'))
const cssFiles = files.filter((path) => path.endsWith('.css'))
const gzipSize = (paths) => paths.reduce((total, path) => total + gzipSync(readFileSync(path)).byteLength, 0)
const javascriptGzip = gzipSize(javascriptFiles)
const html = readFileSync(join(outputDirectory, 'index.html'), 'utf8')
const entryAssets = [
  ...[...html.matchAll(/<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="([^"]+)")[^>]*>/g)].map((match) => match[1]),
  ...[...html.matchAll(/<link\b(?=[^>]*\brel="modulepreload")(?=[^>]*\bhref="([^"]+)")[^>]*>/g)].map((match) => match[1]),
].filter((asset) => typeof asset === 'string')
const javascriptEntryFiles = [...new Set(entryAssets.map((asset) => resolve(outputDirectory, asset.replace(/^\.\//, ''))))]
if (javascriptEntryFiles.length === 0 || javascriptEntryFiles.some((path) => !files.includes(path))) {
  throw new Error('Unable to resolve the initial JavaScript assets from dist/index.html.')
}
const javascriptEntryGzip = gzipSize(javascriptEntryFiles)
const cssGzip = gzipSize(cssFiles)
const totalOutput = files.reduce((total, path) => total + statSync(path).size, 0)

const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`
console.log(`Bundle budgets: initial JS gzip ${format(javascriptEntryGzip)} / ${format(budgets.javascriptEntryGzip)}, all JS gzip ${format(javascriptGzip)} / ${format(budgets.javascriptGzip)}, CSS gzip ${format(cssGzip)} / ${format(budgets.cssGzip)}, output ${format(totalOutput)} / ${format(budgets.totalOutput)}`)

const exceeded = [
  ['Initial JavaScript gzip', javascriptEntryGzip, budgets.javascriptEntryGzip],
  ['JavaScript gzip', javascriptGzip, budgets.javascriptGzip],
  ['CSS gzip', cssGzip, budgets.cssGzip],
  ['Total output', totalOutput, budgets.totalOutput],
].filter(([, actual, limit]) => actual > limit)

if (exceeded.length > 0) {
  for (const [name, actual, limit] of exceeded) {
    console.error(`${name} exceeds its budget: ${format(actual)} > ${format(limit)}`)
  }
  process.exitCode = 1
}
