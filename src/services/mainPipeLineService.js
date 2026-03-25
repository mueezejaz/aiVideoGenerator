
class mainPipeLineService {
  constructor() {
    this.state = {};
  }
  start(event, query) {
    console.log("this is query from the service", query)
  }
}

module.exports = new mainPipeLineService();
