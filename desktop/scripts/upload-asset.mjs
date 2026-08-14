import { spawn } from 'node:child_process'
import { openSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(scriptDir, '..')

const assetName = process.argv[2]
const fileArg = process.argv[3]
const mode = process.argv[4] ?? 'direct'
const token = process.env.DSH_GH_TOKEN
const releaseId = process.env.DSH_RELEASE_ID ?? '370399869'
const file = resolve(desktopRoot, fileArg)

if (!token || !assetName || !fileArg) {
  throw new Error('usage: DSH_GH_TOKEN=... node scripts/upload-asset.mjs <asset> <file> [direct|proxy]')
}

const url = `https://uploads.github.com/repos/hooklaky-crypto/deepseek-harness-desktop-win/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`
const args = [
  '--http1.1', '-sS',
  '-H', `Authorization: Bearer ${token}`,
  '-H', 'Content-Type: application/octet-stream',
  '--data-binary', `@${file}`,
]
if (mode === 'proxy') args.push('-x', 'http://127.0.0.1:7897')
args.push(url)

const logPath = join(desktopRoot, 'staging', `upload-${assetName.replace(/[^a-zA-Z0-9.-]/g, '-')}.log`)
const logFd = openSync(logPath, 'a')
const child = spawn('curl.exe', args, {
  detached: true,
  stdio: ['ignore', logFd, logFd],
  windowsHide: true,
})
child.unref()
console.log(`PID=${child.pid}`)
console.log(`LOG=${logPath}`)
