import { spawnSync } from 'node:child_process'
import {
  cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  renameSync, rmSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../..')
const desktopRoot = join(repoRoot, 'desktop')
const runtimeRoot = join(desktopRoot, 'runtime')
const sourceDirs = [
  ['apps', join(repoRoot, 'apps')],
  ['packages', join(repoRoot, 'packages')],
  ['vendor', join(repoRoot, 'vendor')],
  ['native', join(repoRoot, 'native')],
]

const SKIP_NAMES = new Set([
  '.git', 'node_modules', 'coverage', '.turbo', '.cache', 'dist-e2e',
])

function toFileUrl(absPath) {
  return `file:///${absPath.split(sep).join('/').replace(/^([A-Za-z]):/, '$1:')}`
}

function copyTree(src, dest) {
  const entries = readdirSync(src, { withFileTypes: true })
  mkdirSync(dest, { recursive: true })
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue
    const from = join(src, entry.name)
    const to = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyTree(from, to)
    } else if (entry.isFile()) {
      cpSync(from, to)
    }
  }
}

function packageDirs(root) {
  const found = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (!entry.isDirectory()) continue
      const manifestPath = join(full, 'package.json')
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        if (typeof manifest.name === 'string' && !found.has(manifest.name)) {
          found.set(manifest.name, full)
        }
      }
      walk(full)
    }
  }
  walk(root)
  return found
}

function rewriteDependencySpecs(manifestPath, packages) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  let changed = false
  for (const section of [
    'dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies',
  ]) {
    const deps = manifest[section]
    if (deps === undefined) continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace:')) {
        const target = packages.get(name)
        if (target === undefined) {
          throw new Error(`${manifestPath}: cannot resolve workspace dependency ${name}`)
        }
        deps[name] = toFileUrl(target)
        changed = true
      }
    }
  }
  if (changed) writeFileSync(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`)
}

function dereferenceLinks(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    let stat
    try {
      stat = lstatSync(full)
    } catch {
      continue
    }
    if (stat.isSymbolicLink()) {
      const target = resolve(dirname(full), readlinkSync(full))
      if (!existsSync(target)) continue
      const temp = `${full}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`
      cpSync(target, temp, { recursive: true })
      unlinkSync(full)
      if (existsSync(full)) rmSync(full, { recursive: true, force: true })
      renameWithRetry(temp, full)
    } else if (stat.isDirectory()) {
      dereferenceLinks(full)
    }
  }
}

function renameWithRetry(from, to, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      if (attempt === attempts - 1) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)
    }
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

try {
  if (existsSync(runtimeRoot)) {
    console.log('cleaning old runtime...')
    rmSync(runtimeRoot, { recursive: true, force: true })
  }
  mkdirSync(runtimeRoot, { recursive: true })

  for (const [name, src] of sourceDirs) {
    if (!existsSync(src)) continue
    console.log(`copying ${name}...`)
    copyTree(src, join(runtimeRoot, name))
  }

  const packages = new Map()
  for (const [name] of sourceDirs) {
    const root = join(runtimeRoot, name)
    if (!existsSync(root)) continue
    for (const [pkgName, dir] of packageDirs(root)) {
      if (!packages.has(pkgName)) packages.set(pkgName, dir)
    }
  }
  console.log(`discovered ${packages.size} workspace packages`)

  for (const [name] of sourceDirs) {
    const root = join(runtimeRoot, name)
    if (!existsSync(root)) continue
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue
        const full = join(dir, entry.name)
        if (!entry.isDirectory()) continue
        const manifestPath = join(full, 'package.json')
        if (existsSync(manifestPath)) rewriteDependencySpecs(manifestPath, packages)
        walk(full)
      }
    }
    console.log(`rewriting ${name} manifests...`)
    walk(root)
  }

  const dependencies = {}
  for (const [name, dir] of packages) {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    if (manifest.os !== undefined && !manifest.os.includes(process.platform)) continue
    if (manifest.cpu !== undefined && !manifest.cpu.includes(process.arch)) continue
    dependencies[name] = toFileUrl(dir)
  }
  const runtimeManifest = {
    name: 'dsh-desktop-runtime',
    version: '0.1.0',
    private: true,
    type: 'module',
    dependencies,
  }
  writeFileSync(join(runtimeRoot, 'package.json'), `${JSON.stringify(runtimeManifest, undefined, 2)}\n`)

  console.log('running npm install (prod only)...')
  const install = spawnSync(npmCommand(), [
    'install', '--omit=dev', '--legacy-peer-deps',
    '--no-audit', '--no-fund', '--no-package-lock',
  ], {
    cwd: runtimeRoot,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  })
  if (install.error !== undefined) {
    throw install.error
  }
  if (install.status !== 0) {
    console.error(`npm install exited with status ${String(install.status)}`)
    process.exit(install.status ?? 1)
  }

  const nodeModules = join(runtimeRoot, 'node_modules')
  console.log('dereferencing node_modules links...')
  dereferenceLinks(nodeModules)

  for (const rel of ['apps', 'packages', 'vendor', 'native', 'package-lock.json', 'node_modules/.package-lock.json']) {
    const target = join(runtimeRoot, rel)
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
  }

  console.log(`runtime ready at ${runtimeRoot}`)
} catch (error) {
  console.error(error)
  process.exit(1)
}
