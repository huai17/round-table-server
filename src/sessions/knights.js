const logger = require("../utils/logger");
// const io = require("../utils/socketIo").getIo();

const _knights = {};

const getKnights = () => {
  logger.log(`[KNIGHT] Get All`);

  return _knights;
};
const getKnight = (socketId) => {
  logger.log(`[KNIGHT] Knight <${socketId}> - Get`);

  return _knights[socketId];
};

function Knight({ socket, name, table, seatNumber }) {
  const self = this;
  logger.log(`[KNIGHT] Knight <${socket.id}> - Register`);

  if (_knights[socket.id])
    throw new Error(`[KNIGHT] Knight <${socket.id}> Already Exists`);

  self.id = socket.id;
  self.name = name;
  self.tableId = table.id;
  self.seatNumber = seatNumber;
  self.candidatesQueue = {};
  self.webRtcEndpoints = {};
  self.webRtcEndpointIds = {};
  self.hubPorts = {};
  self.hubPortIds = {};
  _knights[socket.id] = self;
}

Knight.prototype.send = function (message) {
  const self = this;
  logger.log(`[KNIGHT] Knight <${self.id}> - Send Message: ${message.id}`);

  // io.to(self.id).send(message);
};

Knight.prototype.setWebRtcEndpoint = function ({ source, webRtcEndpoint }) {
  const self = this;
  logger.log(
    `[KNIGHT] Knight <${self.id}> - Set "webRtcEndpoint" Of Source: ${source}`
  );

  self.webRtcEndpoints[source] = webRtcEndpoint;
  self.webRtcEndpointIds[source] = webRtcEndpoint.id;
};

Knight.prototype.setHubPort = function ({ source, hubPort }) {
  const self = this;
  logger.log(`[KNIGHT] Knight <${self.id}> Set "hubPort" Of Source: ${source}`);

  self.hubPorts[source] = hubPort;
  self.hubPortIds[source] = hubPort.id;
};

Knight.prototype.unregister = function () {
  const self = this;
  logger.log(`[KNIGHT] Knight <${self.id}> - Unregister`);

  for (let source in self.webRtcEndpoints) {
    if (self.webRtcEndpoints[source]) {
      self.webRtcEndpoints[source].release();
      delete self.webRtcEndpoints[source];
      delete self.webRtcEndpointIds[source];
    }
  }
  self.webRtcEndpoints = {};
  self.webRtcEndpointIds = {};
  for (let source in self.hubPorts) {
    if (self.hubPorts[source]) {
      self.hubPorts[source].release();
      delete self.hubPorts[source];
      delete self.hubPortIds[source];
    }
  }
  self.hubPorts = {};
  self.hubPortIds = {};
  delete _knights[self.id];
};

Knight.prototype.lean = function () {
  const self = this;
  logger.log(`[KNIGHT] Knight <${self.id}> - Lean`);

  return {
    id: self.id,
    name: self.name,
    tableId: self.tableId,
    seatNumber: self.seatNumber,
    webRtcEndpointIds: self.webRtcEndpointIds,
    hubPortIds: self.hubPortIds,
  };
};

Knight.prototype.toObject = function () {
  const self = this;
  logger.log(`[KNIGHT] Knight <${self.id}> - To Object`);

  return {
    id: self.id,
    name: self.name,
    tableId: self.tableId,
    seatNumber: self.seatNumber,
  };
};

module.exports = { Knight, getKnights, getKnight };
