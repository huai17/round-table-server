const crypto = require("crypto");
const logger = require("../utils/logger");

const _tables = {};

const getTables = () => {
  logger.log(`[TABLE] Get All`);
  return _tables;
};

const getTable = (tableId) => {
  logger.log(`[TABLE] Table <${tableId}> - Get`);
  return _tables[tableId];
};

const parseSeatNumber = (seatNumber) => {
  logger.log(`[TABLE] Parse Seat Number: ${seatNumber}`);
  return Buffer.from(seatNumber, "base64").toString("ascii").split("#");
};

function Table({ numberOfSeats = 10 }) {
  let tableId = "";
  do {
    tableId = crypto.randomBytes(12).toString("base64").replace(/=/g, "");
  } while (_tables[tableId]);
  logger.log(`[TABLE] Table <${tableId}> - Reserve`);
  const self = this;
  self.id = tableId;
  self.numberOfSeats = numberOfSeats;
  self.host = null;
  self.seats = new Set();
  self.participants = new Set();
  self.mediaPipeline = null;
  self.mediaPipelineId = null;
  self.composite = null;
  self.compositeId = null;
  self.dispatcher = null;
  self.dispatcherId = null;
  for (let i = 0; i < numberOfSeats; i++) {
    const seatNumber = Buffer.from(`${tableId}#${i}`)
      .toString("base64")
      .replace(/=/g, "");
    self.seats.add(seatNumber);
  }
  _tables[tableId] = self;
}

Table.prototype.setMediaPipeline = function ({ mediaPipeline }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Set "mediaPipeline"`);
  self.mediaPipeline = mediaPipeline;
  self.mediaPipelineId = mediaPipeline.id;
};

Table.prototype.setComposite = function ({ composite }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Set "composite"`);
  self.composite = composite;
  self.compositeId = composite.id;
};

Table.prototype.setDispatcher = function ({ dispatcher }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Set "dispatcher"`);
  self.dispatcher = dispatcher;
  self.dispatcherId = dispatcher.id;
};

Table.prototype.join = function ({ socketId, seatNumber, isHost }) {
  const self = this;
  if (isHost) {
    logger.log(`[TABLE] Table <${self.id}> - Host <${socketId}> Joined`);
    self.host = socketId;
    self.participants.add(socketId);
  } else {
    logger.log(`[TABLE] Table <${self.id}> - Knight <${socketId}> Joined`);
    if (!self.seats.has(seatNumber)) throw new Error("Invalid seatNumber");
    self.participants.add(socketId);
    self.seats.delete(seatNumber);
  }
};

Table.prototype.leave = function ({ socketId }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Knight <${socketId}> Left`);
  self.participants.delete(socketId);
};

Table.prototype.release = function () {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Release`);
  if (self.mediaPipeline) {
    self.mediaPipeline.release();
    self.mediaPipeline = null;
    self.mediaPipelineId = null;
  }
  if (self.composite) {
    self.composite.release();
    self.composite = null;
    self.compositeId = null;
  }
  if (self.dispatcher) {
    self.dispatcher.release();
    self.dispatcher = null;
    self.dispatcherId = null;
  }
  delete _tables[self.id];
};

Table.prototype.toObject = function () {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - To Object`);
  return {
    id: self.id,
    numberOfSeats: self.numberOfSeats,
    host: self.host,
    seats: Array.from(self.seats),
    participants: Array.from(self.participants),
    mediaPipelineId: self.mediaPipelineId,
    compositeId: self.compositeId,
    dispatcherId: self.dispatcherId,
  };
};

module.exports = { Table, getTables, getTable, parseSeatNumber };
