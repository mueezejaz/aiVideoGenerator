const aiService = require("./aiService.js");

class mainPipeLineService {
  constructor() {
    this.state = {};
  }
  async start(updateProgress, query) {
    console.log("this is query from the service", query)
    updateProgress({ data: "started" })
    console.log("start")
    const [data, error] = await aiService.generateScriptAndOverview(query);
    console.log("this is error:", error);
    console.log("end")
    console.log("this is function", data)
  }
}

module.exports = new mainPipeLineService();
