import { app, BrowserWindow, shell } from 'electron'

// 临时诊断（定位启动后 ~30s 静默退出）：写文件，绕过 electron-vite 的 stdout 吞噬
import fs2 from 'node:fs'
const dbg = (msg: string): void => {
  try {
    fs2.appendFileSync(path.join(app.getPath('userData'), 'main-debug.log'), `${new Date().toISOString()} ${msg}
`)
  } catch {}
}
process.on('exit', (code) => dbg(`main exit code=${code}`))
process.on('uncaughtException', (err) => dbg(`uncaughtException: ${err?.stack || err}`))
process.on('unhandledRejection', (err) => dbg(`unhandledRejection: ${err}`))

// 钉死数据目录名：dev 与打包版共用 %APPDATA%/zhaixing，防止 productName 变化导致数据漂移
app.setName('zhaixing')
import path from 'node:path'
import { backupDatabase, closeDb } from './db/connection'
import { registerIpc } from './ipc'
import { runHeadlessAi, runHeadlessMerge, runHeadlessSync, runHeadlessWiki } from './headless'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    title: '摘星实录',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('render-process-gone', (_e, details) => dbg(`render-process-gone: ${JSON.stringify(details)}`))
  win.webContents.on('did-fail-load', (_e, code, desc) => dbg(`did-fail-load: ${code} ${desc}`))
  win.on('close', () => dbg('window close event'))
  win.on('closed', () => dbg('window closed event'))
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL).catch((e) => dbg(`loadURL reject: ${e}`))
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  dbg('app ready, rotating backup')
  backupDatabase() // 启动即轮换备份
  registerIpc()
  if (process.env.ZHAIXING_SYNC) {
    // 无界面批量同步模式：同步完自动退出
    void runHeadlessSync()
    return
  }
  if (process.env.ZHAIXING_AI) {
    // 无界面 AI 分析模式
    void runHeadlessAi()
    return
  }
  if (process.env.ZHAIXING_WIKI) {
    void runHeadlessWiki()
    return
  }
  if (process.env.ZHAIXING_MERGE) {
    void runHeadlessMerge()
    return
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  console.log('[zhaixing] window-all-closed, windows:', BrowserWindow.getAllWindows().length)
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDb()
})
