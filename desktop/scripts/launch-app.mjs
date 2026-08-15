import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(scriptDir, '..')
const exePath = resolve(desktopRoot, process.argv[2])
const child = spawn(exePath, [], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
})
child.unref()
console.log(`PID=${child.pid}`)
