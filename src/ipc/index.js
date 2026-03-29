//get ipcs from all the availbe ipcs

const { ipcMain } = require("electron");
const mainPipeLineService = require("../services/mainPipeLineService.js");
const setupService = require("../services/setupService.js");
function registerIpcHandlers() {
  //for pipeline
  ipcMain.on("sendQuery", async (event, query) => {

    await mainPipeLineService.start((update) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("sendProgress", update)
      }
    }, query)
  })
  //for setup
  ipcMain.on("runSetup", (event) => {
    setupService.runSetup((progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send("setupProgress", progress);
      }
    });
  });
}

module.exports = registerIpcHandlers;

