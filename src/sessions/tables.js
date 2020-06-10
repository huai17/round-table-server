const crypto = require("crypto");
const logger = require("../utils/logger");

const _tables = {};

const getTables = () => {
  logger.log(`Get all tables`);
  return _tables;
};

const getTable = (tableId) => {
  logger.log(`Get table: ${tableId}`);
  return _tables[tableId];
};

const parseSeatNumber = (seatNumber) => {
  return Buffer.from(seatNumber, "base64").toString("ascii").split("#");
};

function Table({ numberOfSeats = 10 }) {
  logger.log(`Reserve new table`);
  let tableId = "";
  do {
    tableId = crypto.randomBytes(12).toString("base64").replace(/=/g, "");
  } while (_tables[tableId]);
  const self = this;
  self.id = tableId;
  self.numberOfSeats = numberOfSeats;
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
  logger.log(`Set mediaPipeline of table: ${self.id}`);
  self.mediaPipeline = mediaPipeline;
  self.mediaPipelineId = mediaPipeline.id;
};

Table.prototype.setComposite = function ({ composite }) {
  const self = this;
  logger.log(`Set composite of table: ${self.id}`);
  self.composite = composite;
  self.compositeId = composite.id;
};

Table.prototype.setDispatcher = function ({ dispatcher }) {
  const self = this;
  logger.log(`Set dispatcher of table: ${self.id}`);
  self.dispatcher = dispatcher;
  self.dispatcherId = dispatcher.id;
};

Table.prototype.join = function ({ socketId, seatNumber }) {
  const self = this;
  logger.log(`Knight: ${socketId} join table: ${self.id}`);
  if (!self.seats.has(seatNumber)) throw new Error("Invalid seatNumber");
  self.participants.add(socketId);
  self.seats.delete(seatNumber);
};

Table.prototype.leave = function ({ socketId }) {
  const self = this;
  logger.log(`Knight: ${socketId} leave table: ${self.id}`);
  self.participants.delete(socketId);
};

Table.prototype.release = function () {
  const self = this;
  logger.log(`Release table: ${self.id}`);
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
  logger.log(`Formatting table: ${self.id}`);

  return {
    id: self.id,
    numberOfSeats: self.numberOfSeats,
    seats: Array.from(self.seats),
    participants: Array.from(self.participants),
    mediaPipelineId: self.mediaPipelineId,
    compositeId: self.compositeId,
    dispatcherId: self.dispatcherId,
  };
};

module.exports = { Table, getTables, getTable, parseSeatNumber };
