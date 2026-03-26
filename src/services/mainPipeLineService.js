
class mainPipeLineService {
  constructor() {
    this.state = {};
  }
  start(updateProgress, query) {
    console.log("this is query from the service", query)
    updateProgress({ data: "started", count: count })
  }
}

module.exports = new mainPipeLineService();
