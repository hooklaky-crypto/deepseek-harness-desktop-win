import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(scriptDir, '..')
const runtimeRoot = join(desktopRoot, 'runtime')
const smokeHome = join(desktopRoot, 'staging', 'smoke-home')
const nodeExe = join(desktopRoot, 'resources', 'node', 'node.exe')
const dshBin = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

if (!existsSync(nodeExe)) throw new Error(`missing node.exe: ${nodeExe}`)
if (!existsSync(dshBin)) throw new Error(`missing dsh bin: ${dshBin}`)

rmSync(smokeHome, { recursive: true, force: true })

const child = spawn(nodeExe, [dshBin, 'web', '--host', '127.0.0.1', '--port', '0'], {
  cwd: desktopRoot,
  env: { ...process.env, DSH_HOME: smokeHome, DSH_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

let ready = false
let url = ''
for (let attempt = 0; attempt < 60; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 1000))
  if (url === '') {
    const line = stdout.split('\n').find((value) => value.includes('dsh web:'))
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
      // Server may still be booting.
    }
  }
  if (child.exitCode !== null) break
}

console.log(`READY=${ready}`)
if (!ready) {
  console.log(`STDOUT=${stdout.slice(0, 800).replace(/\r?\n/g, ' | ')}`)
  console.log(`STDERR=${stderr.slice(0, 2000).replace(/\r?\n/g, ' | ')}`)
}

child.kill()
setTimeout(() => child.kill('SIGKILL'), 3000).unref()

if (!ready) process.exitCode = 1
