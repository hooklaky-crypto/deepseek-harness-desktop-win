import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopRoot = join(scriptDir, '..')
const repoRoot = join(scriptDir, '../..')
const outputDir = join(desktopRoot, 'design')
const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url))
const { chromium } = webRequire('playwright')

function waitForLine(child, predicate, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('timeout waiting for process output')), timeoutMs)
    const onData = (chunk) => {
      buffer += chunk
      const line = buffer.split('\n').find(predicate)
      if (line !== undefined) {
        clearTimeout(timer)
        child.stdout.off('data', onData)
        resolve(line)
      }
    }
    child.stdout.on('data', onData)
    child.on('exit', () => {
      clearTimeout(timer)
      reject(new Error('process exited before ready'))
    })
  })
}

function killTree(child) {
  try {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    child.kill('SIGKILL')
  }
}

async function screenshotScenario(name, options) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-shot-'))
  const processes = []
  try {
    let mock = null
    if (options.mock) {
      mock = spawn(process.execPath, [
        '--import', 'tsx/esm',
        'packages/test-support/llm-mock-server/src/bin.ts',
        '--sequence', 'success', '--repeat-last', '--port', '8765',
      ], {
        cwd: repoRoot,
        env: { ...process.env, DSH_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      processes.push(mock)
      await waitForLine(mock, line => line.includes('"type":"ready"'))
    }

    const dsh = spawn(process.execPath, [
      '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--port', String(options.port),
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DSH_HOME: home,
        DSH_TELEMETRY_DISABLED: '1',
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    processes.push(dsh)
    const urlLine = await waitForLine(dsh, line => line.includes('dsh web:'))
    const url = urlLine.match(/http:\/\/127\.0\.0\.1:\d+/)[0]

    let browser
    try {
      browser = await chromium.launch()
    } catch {
      browser = await chromium.launch({ channel: 'msedge' })
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(url)
    await page.waitForTimeout(9000)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const dismiss = page.getByRole('button', { name: '继续', exact: true })
      if (await dismiss.count() === 0) break
      await dismiss.click()
      await page.waitForTimeout(2000)
    }
    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log(`HAS_PLUGIN=${bodyText.includes('插件')}`)
    console.log(`TEXT=${bodyText.slice(0, 900).replace(/\n/g, ' | ')}`)
    const out = join(outputDir, `${name}.png`)
    await page.screenshot({ path: out })
    await browser.close()
    console.log(`SAVED=${out}`)
  } finally {
    for (const child of processes.reverse()) killTree(child)
    rmSync(home, { recursive: true, force: true })
  }
}

await screenshotScenario('main-ui-real', {
  mock: true,
  port: 18080,
  env: { DEEPSEEK_API_KEY: 'test', DEEPSEEK_BASE_URL: 'http://127.0.0.1:8765/v1' },
})
await screenshotScenario('onboarding-ui-real', { mock: false, port: 18081, env: {} })
