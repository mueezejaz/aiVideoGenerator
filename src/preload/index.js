// ToDo
// import all the api differently for each service here and add it to context bridge
const { contextBridge } = require("electron")


contextBridge.exposeInMainWorld('api', {
  data: "hello from backend",
})


