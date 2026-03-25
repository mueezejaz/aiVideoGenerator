// ToDo
// import all the api differently for each service here and add it to context bridge
const { contextBridge, ipcRenderer } = require("electron")


contextBridge.exposeInMainWorld('api', {
  sendQuery: (query) => { ipcRenderer.send("sendQuery", query) }
})


