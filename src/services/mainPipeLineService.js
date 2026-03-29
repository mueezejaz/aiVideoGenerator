const aiService = require("./aiService.js");
const audioService = require("./audioService.js");
const mergeService = require("./mergeService.js");
const videoService = require("./videoService.js");

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
    await audioService.convertScriptsToAudio(data.scenes)
    await videoService.start(data.scenes)
    const [finalVideoPath, mergeError] = await mergeService.start(data.scenes);
    if (mergeError) {
      console.error("Merge failed:", mergeError);
      updateProgress({ stage: "error", error: mergeError });
      return;
    }

    console.log("Pipeline complete! Final video:", finalVideoPath);
  }
}

module.exports = new mainPipeLineService();
