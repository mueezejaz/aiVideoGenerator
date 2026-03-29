const { BrowserWindow } = require('electron')
const path = require('path')

function createMainWindow() {
  console.log("this is the path", __dirname)
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // To do
  // const isDev = process.env.NODE_ENV === 'development'
  const isDev = false;
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../src/client/dist/index.html'))
    win.webContents.openDevTools()
  }

  win.once('ready-to-show', () => win.show())
  return win
}

module.exports = { createMainWindow }
