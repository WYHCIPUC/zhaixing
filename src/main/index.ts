import { app, BrowserWindow, shell } from 'electron'

// 钉死数据目录名：dev 与打包版共用 %APPDATA%/zhaixing，防止 productName 变化导致数据漂移
app.setName('zhaixing')
import path from 'node:path'
import { backupDatabase, closeDb } from './db/connection'
import { registerIpc } from './ipc'
import { runHeadlessSync } from './headless'

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

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  backupDatabase() // 启动即轮换备份
  registerIpc()
  if (process.env.ZHAIXING_SYNC) {
    // 无界面批量同步模式：同步完自动退出
    void runHeadlessSync()
    return
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDb()
})
