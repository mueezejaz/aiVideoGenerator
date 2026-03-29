// ToDo
// import all the api differently for each service here and add it to context bridge
const { contextBridge, ipcRenderer } = require("electron")


contextBridge.exposeInMainWorld('api', {
  sendQuery: (query) => { ipcRenderer.send("sendQuery", query) },
  getProgress: (callback) => ipcRenderer.on("sendProgress", (event, update) => callback(update)),
  // Setup
  runSetup: () => { ipcRenderer.send("runSetup"); },
  onSetupProgress: (callback) => ipcRenderer.on("setupProgress", (event, progress) => callback(progress)),
})


