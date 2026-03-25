//get ipcs from all the availbe ipcs

const { ipcMain } = require("electron");
const mainPipeLineService = require("../services/mainPipeLineService");
function registerIpcHandlers() {
  ipcMain.on("sendQuery", (event, query) => {
    mainPipeLineService.start(event, query)
  })
}

module.exports = registerIpcHandlers;

