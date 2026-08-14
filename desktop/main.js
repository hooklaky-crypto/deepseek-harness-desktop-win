const { app, BrowserWindow, Menu, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const SERVER_READY_TIMEOUT_MS = 120_000
const SERVER_URL_PATTERN = /dsh web: (http:\/\/127\.0\.0\.1:\d+)/

let mainWindow = null
let serverProcess = null
let serverUrl = null
let serverOutput = ''
let quitting = false

function runtimeDir() {
  return path.join(app.getAppPath(), 'runtime')
}

function dshBin() {
  return path.join(runtimeDir(), 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

function nodeExecutable() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'node', 'node.exe')
  return process.execPath
}

function logFile() {
  return path.join(app.getPath('userData'), 'dsh-server.log')
}

function appendLog(line) {
  try {
    fs.appendFileSync(logFile(), line)
  } catch {
    // Logging is best effort; the app must still boot without a writable log.
  }
}

function stopServer() {
  if (serverProcess !== null && !serverProcess.killed) {
    serverProcess.kill()
  }
  serverProcess = null
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'DeepSeek Harness Desktop',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(serverUrl)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(serverUrl)) return
    event.preventDefault()
    shell.openExternal(url)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open in Browser',
          enabled: () => serverUrl !== null,
          click: () => {
            if (serverUrl !== null) shell.openExternal(serverUrl)
          },
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow !== null) mainWindow.webContents.reload()
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Log Folder',
          click: () => {
            shell.openPath(app.getPath('userData'))
          },
        },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'DeepSeek Harness Desktop',
              detail: `Version ${app.getVersion()}\nDeepSeek Harness ${require(path.join(runtimeDir(), 'node_modules', '@deepseek-ai', 'dsh', 'package.json')).version}`,
            })
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function startServer() {
  return new Promise((resolve, reject) => {
    const node = nodeExecutable()
    const bin = dshBin()
    const cwd = app.getPath('documents')
    const env = {
      ...process.env,
      DSH_HOME: path.join(app.getPath('userData'), 'dsh-home'),
      DSH_TELEMETRY_DISABLED: '1',
    }

    serverOutput = ''
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true })
      fs.appendFileSync(logFile(), `\n[${new Date().toISOString()}] starting: ${node} ${bin} web\n`)
    } catch {
      // Continue even when the log cannot be written.
    }

    serverProcess = spawn(node, [bin, 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      reject(new Error(`dsh server did not report ready within ${SERVER_READY_TIMEOUT_MS / 1000}s`))
    }, SERVER_READY_TIMEOUT_MS)

    serverProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      serverOutput += text
      appendLog(text)
      const match = serverOutput.match(SERVER_URL_PATTERN)
      if (match !== null) {
        clearTimeout(timer)
        serverUrl = match[1]
        resolve(serverUrl)
      }
    })

    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      serverOutput += text
      appendLog(text)
    })

    serverProcess.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    serverProcess.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (quitting) return
      const tail = serverOutput.slice(-1500)
      dialog.showErrorBox(
        'DeepSeek Harness server exited',
        `The dsh web server stopped unexpectedly (exit ${String(code)}, signal ${String(signal)}).\n\nLog tail:\n${tail}`,
      )
      app.quit()
    })
  })
}

async function boot() {
  if (fs.existsSync(dshBin()) === false) {
    dialog.showErrorBox(
      'Missing runtime',
      `Could not find dsh runtime at:\n${dshBin()}\n\nRun "npm run stage" in the desktop folder and try again.`,
    )
    app.quit()
    return
  }

  buildMenu()
  try {
    await startServer()
  } catch (error) {
    const tail = serverOutput.slice(-1500)
    dialog.showErrorBox(
      'Failed to start DeepSeek Harness',
      `${String(error instanceof Error ? error.message : error)}\n\nLog tail:\n${tail}`,
    )
    app.quit()
    return
  }

  createWindow()
  await mainWindow.loadURL(serverUrl)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== null) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    boot()
  })
}

app.on('before-quit', () => {
  quitting = true
  stopServer()
})

app.on('window-all-closed', () => {
  app.quit()
})
