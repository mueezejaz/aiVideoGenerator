const { app } = require('electron');
const bootstrap = require("./src/app.js")

app.whenReady().then(bootstrap);
