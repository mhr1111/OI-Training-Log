/**
 * Electron 主进程 —— OI Training Log
 *
 * 开发模式：不启动后端（npm run dev 已经跑了 vite + nodemon），
 *          直接打开窗口 http://localhost:3001
 * 生产模式（打包后）：fork 子进程运行 Express 后端，等待就绪后打开窗口
 *
 * 打包后目录结构（win-unpacked）：
 *   OI-Training-Log.exe
 *   data/                   ← 用户数据（store.json）
 *   resources/
 *     app.asar/
 *       electron/main.js
 *       dist/               ← 前端构建产物（由后端 serve）
 *       dist-server/server.cjs ← 后端（tsup bundle，依赖已内联）
 */
import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fork } from 'node:child_process'
import http from 'node:http'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged
const PORT = Number(process.env.PORT) || 3001

// ---------- 应用图标（build-res/icon.png — 由 electron-builder 自动打包）----------
const APP_ICON = path.join(__dirname, '..', 'build-res', 'icon.png')

// ---------- 存储目录 ----------
function resolveDataDir() {
  if (isDev) {
    return path.join(__dirname, '..', 'api', 'data')
  }
  // exe 同级目录的 data/ — 用户看到的、可直接复制备份的数据目录
  return path.join(path.dirname(process.execPath), 'data')
}

const DATA_DIR = resolveDataDir()
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch (e) {
    console.error('[Electron] Cannot create data dir:', DATA_DIR, e.message)
  }
}
console.log(`[Electron] Data dir: ${DATA_DIR}`)

// ---------- 后端 ----------
let serverProc = null

function startBackend() {
  return new Promise((resolve, reject) => {
    const serverEntry = path.join(__dirname, '..', 'dist-server', 'server.cjs')
    if (!fs.existsSync(serverEntry)) {
      reject(new Error(`后端文件不存在：${serverEntry}\n请先执行 npm run build:server`))
      return
    }

    const env = { ...process.env, PORT: String(PORT), OI_DASHBOARD_DATA_DIR: DATA_DIR }
    serverProc = fork(serverEntry, { env, stdio: 'inherit' })

    serverProc.on('error', reject)

    // 轮询等待后端就绪
    const deadline = Date.now() + 15000
    const probe = () => {
      if (Date.now() > deadline) {
        serverProc?.kill()
        reject(new Error('后端启动超时（15s）'))
        return
      }
      http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else setTimeout(probe, 300)
      }).on('error', () => setTimeout(probe, 300))
    }
    setTimeout(probe, 800)
  })
}

// ---------- 窗口 ----------
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0d1117',
    title: 'OI Training Log',
    icon: APP_ICON,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`)
  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------- 生命周期 ----------
function cleanup() {
  if (serverProc && !serverProc.killed) {
    try { serverProc.kill('SIGTERM') } catch {}
    serverProc = null
  }
}

app.whenReady().then(async () => {
  try {
    if (isDev) {
      console.log('[Electron] Dev mode — backend assumed already running on port', PORT)
    } else {
      console.log('[Electron] Prod mode — starting backend...')
      await startBackend()
      console.log('[Electron] Backend ready.')
    }
    createWindow()
  } catch (err) {
    console.error('[Electron] Startup failed:', err)
    dialog.showErrorBox(
      'OI Training Log — 启动失败',
      `后端服务无法启动：\n\n${err.message || err}\n\n请检查端口 ${PORT} 是否被占用。`,
    )
    app.quit()
  }
})

app.on('window-all-closed', () => { cleanup(); app.quit() })
app.on('before-quit', cleanup)
