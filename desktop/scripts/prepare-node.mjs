import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDir, '..')
const nodeVersion = process.versions.node
const resourceDir = join(desktopRoot, 'resources', 'node')
const nodeExe = join(resourceDir, 'node.exe')
const zipPath = join(desktopRoot, 'resources', `node-${nodeVersion}.zip`)
const extractDir = join(desktopRoot, 'resources', `node-${nodeVersion}-extract`)

if (existsSync(nodeExe)) {
  console.log(`node.exe already present (v${nodeVersion})`)
  process.exit(0)
}

const url = `https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-win-x64.zip`
mkdirSync(resourceDir, { recursive: true })
console.log(`downloading ${url}`)
const response = await fetch(url)
if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`)
writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()))

mkdirSync(extractDir, { recursive: true })
const extract = spawnSync('tar', ['-xf', zipPath, '-C', extractDir], { stdio: 'inherit' })
if (extract.status !== 0) process.exit(extract.status ?? 1)

const extracted = join(extractDir, `node-v${nodeVersion}-win-x64`, 'node.exe')
if (!existsSync(extracted)) throw new Error(`node.exe not found after extraction: ${extracted}`)
cpSync(extracted, nodeExe)

rmSync(zipPath, { force: true })
rmSync(extractDir, { recursive: true, force: true })
console.log(`node.exe ready at ${nodeExe}`)
