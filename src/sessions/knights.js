const logger = require("../utils/logger");

const _knights = {};

const getKnights = () => {
  logger.log(`Get all knights`);
  return _knights;
};
const getKnight = (socketId) => {
  logger.log(`Get knight: ${socketId}`);
  return _knights[socketId];
};

function Knight({ socket, name, table }) {
  logger.log(`Register new knight: ${socket.id}`);
  console.log(_knights[socket.id]);
  if (_knights[socket.id])
    throw new Error(`Knight: ${socket.id} already exists`);
  const self = this;
  self.id = socket.id;
  self.socket = socket;
  self.name = name;
  self.table = table;
  self.tableId = table.id;

  self.candidatesQueue = {};
  self.webRtcEndpoints = {};
  self.webRtcEndpointIds = {};
  self.hubPorts = {};
  self.hubPortIds = {};

  _knights[socket.id] = self;
}

Knight.prototype.setWebRtcEndpoint = function ({ source, webRtcEndpoint }) {
  const self = this;
  logger.log(`Set webRtcEndpoint of knight: ${self.id} from source: ${source}`);
  self.webRtcEndpoints[source] = webRtcEndpoint;
  self.webRtcEndpointIds[source] = webRtcEndpoint.id;
};

Knight.prototype.setHubPort = function ({ source, hubPort }) {
  const self = this;
  logger.log(`Set hubPort of knight: ${self.id} from source: ${source}`);
  self.hubPorts[source] = hubPort;
  self.hubPortIds[source] = hubPort.id;
};

Knight.prototype.unregister = function () {
  const self = this;
  logger.log(`Unregister knight: ${self.id}`);
  for (let source in self.webRtcEndpoints) {
    if (self.webRtcEndpoints[source]) {
      self.webRtcEndpoints[source].release();
      delete self.webRtcEndpoints[source];
      delete self.webRtcEndpointIds[source];
    }
  }
  for (let source in self.hubPorts) {
    if (self.hubPorts[source]) {
      self.hubPorts[source].release();
      delete self.hubPorts[source];
      delete self.hubPortIds[source];
    }
  }

  self.socket = null;
  self.name = null;
  self.table = null;
  self.tableId = null;
  self.candidatesQueue = {};
  self.webRtcEndpoints = {};
  self.webRtcEndpointIds = {};
  self.hubPorts = {};
  self.hubPortIds = {};
  delete _knights[self.id];
};

Knight.prototype.toObject = function () {
  const self = this;
  logger.log(`Formatting knight: ${self.id}`);

  return {
    id: self.id,
    name: self.name,
    tableId: self.tableId,
    webRtcEndpointIds: self.webRtcEndpointIds,
    hubPortIds: self.hubPortIds,
  };
};

module.exports = { Knight, getKnights, getKnight };
