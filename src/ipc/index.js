//get ipcs from all the availbe ipcs

const { ipcMain } = require("electron");
const mainPipeLineService = require("../services/mainPipeLineService");
function registerIpcHandlers() {
  ipcMain.on("sendQuery", (event, query) => {
    mainPipeLineService.start((update) => {
      if (!event.sender.isDestroyed())
        event.sender.send("sendProgress", update)
    }, query)
  })
}

module.exports = registerIpcHandlers;

