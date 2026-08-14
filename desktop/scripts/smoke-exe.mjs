import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(scriptDir, '..')
const exePath = join(desktopRoot, 'dist', 'win-unpacked', 'DeepSeek Harness Desktop.exe')
const appData = process.env.APPDATA
const userData = join(appData, 'dsh-desktop')
const logPath = join(userData, 'dsh-server.log')

if (!existsSync(exePath)) throw new Error(`missing exe: ${exePath}`)
rmSync(logPath, { force: true })

const child = spawn(exePath, [], {
  cwd: desktopRoot,
  stdio: 'ignore',
  windowsHide: true,
})

let ready = false
let url = ''
for (let attempt = 0; attempt < 120; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (existsSync(logPath)) {
    const log = readFileSync(logPath, 'utf8')
    if (url === '') {
      const line = log.split('\n').find((value) => value.includes('dsh web:'))
      if (line !== undefined) url = line.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0] ?? ''
    }
    if (url !== '' && !ready) {
      try {
        const response = await fetch(`${url}/`)
        ready = response.ok
        if (ready) {
          console.log(`READY=${ready}`)
          console.log(`URL=${url}`)
          console.log(`STATUS=${response.status}`)
          console.log(`BODY=${(await response.text()).slice(0, 160).replace(/\s+/g, ' ').trim()}`)
        }
      } catch {
        // The web server may still be starting.
      }
    }
  }
  if (child.exitCode !== null) break
}

console.log(`READY=${ready}`)
if (!ready && existsSync(logPath)) {
  console.log(`LOG=${readFileSync(logPath, 'utf8').slice(-2000).replace(/\r?\n/g, ' | ')}`)
}

spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
if (!ready) process.exitCode = 1
