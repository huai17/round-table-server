require("dotenv").config();
const logger = require("./src/utils/logger");
// logger.setMode("debug");
const express = require("express");
const cors = require("cors");
const app = express();
const http = require("http");
const server = http.createServer(app);

require("./src/utils/socketIo").setIo(server);
require("./src/services/signal");

app.use(cors());

app.get("/", (req, res) => {
  res.send("Round Table Server 🦄");
});

// port setting
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(
    `[SERVER] Round Table Server Start Listening On Port ${PORT} - ${new Date()}`
  );
});
