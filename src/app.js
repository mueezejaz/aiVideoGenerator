// import all the ipcs and register them before creating window
const { app } = require('electron')
const { createMainWindow } = require('./windows/mainWindow.js')
const { BrowserWindow } = require('electron/main')
//const registerIpcHandlers = require('./ipc/index')


async function bootstrap() {
  // Register all IPC handlers first
  // registerIpcHandlers()

  // can create splash loading window here before main windows load
  createMainWindow();
  console.log("starting app")
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    console.log("creating main window")
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

module.exports = bootstrap

