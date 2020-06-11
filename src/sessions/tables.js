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
  const self = this;
  let tableId = "";
  do {
    tableId = crypto.randomBytes(12).toString("base64").replace(/=/g, "");
  } while (_tables[tableId]);
  logger.log(`[TABLE] Table <${tableId}> - Reserve`);

  self.id = tableId;
  self.king = null;
  self.knights = {};
  self.source = null;
  self.numberOfSeats = numberOfSeats;
  self.seats = new Set();
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

Table.prototype.changeSource = function ({ source }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Change Source`);

  self.source = source;
};

Table.prototype.join = function ({ knight, king, seatNumber }) {
  const self = this;
  if (king) {
    logger.log(`[TABLE] Table <${self.id}> - King <${king.id}> Joined`);

    self.king = { id: king.id, name: king.name };
    self.knights[king.id] = { id: king.id, name: king.name };
    self.source = king.id;
  } else {
    logger.log(`[TABLE] Table <${self.id}> - Knight <${knight.id}> Joined`);

    if (!self.seats.has(seatNumber)) throw new Error("Invalid seatNumber");
    self.knights[knight.id] = { id: knight.id, name: knight.name };
    self.seats.delete(seatNumber);
  }
};

Table.prototype.leave = function ({ socketId }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Knight <${socketId}> Left`);

  delete self.knights[socketId];
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

Table.prototype.lean = function () {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Lean`);

  return {
    id: self.id,
    king: self.king,
    knights: self.knights,
    source: self.source,
    numberOfSeats: self.numberOfSeats,
    seats: Array.from(self.seats),
    mediaPipelineId: self.mediaPipelineId,
    compositeId: self.compositeId,
    dispatcherId: self.dispatcherId,
  };
};

Table.prototype.toObject = function (withSeats = true) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - To Object`);

  if (withSeats)
    return {
      id: self.id,
      king: self.king,
      knights: self.knights,
      source: self.source,
      numberOfSeats: self.numberOfSeats,
      seats: Array.from(self.seats),
    };

  return {
    id: self.id,
    king: self.king,
    knights: self.knights,
    source: self.source,
  };
};

module.exports = { Table, getTables, getTable, parseSeatNumber };
