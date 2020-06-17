const crypto = require("crypto");
const logger = require("../utils/logger");
const { resolve } = require("path");
const io = require("../utils/socketIo").getNameSpace("/roundTable");

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

const _generateId = () => {
  let tableId = "";
  do {
    tableId = crypto.randomBytes(12).toString("base64").replace(/=/g, "");
  } while (_tables[tableId]);
  return tableId;
};

function _generateSeat() {
  const self = this;

  let seatNumber = "";
  do {
    seatNumber = Buffer.from(`${self.id}#${Math.random().toFixed(4).slice(2)}`)
      .toString("base64")
      .replace(/=/g, "");
  } while (self.seats[seatNumber]);
  self.seats[seatNumber] = "available";
  self.numberOfSeats++;
}

function Table({ numberOfSeats = 10 }) {
  const self = this;
  self.id = _generateId();
  logger.log(`[TABLE] Table <${self.id}> - Reserve`);

  self.king = null;
  self.knights = {};
  self.source = null;
  self.numberOfSeats = 0;
  self.seats = {};
  self.mediaPipeline = null;
  self.mediaPipelineId = null;
  // self.composite = null;
  // self.compositeId = null;
  self.dispatcher = null;
  self.dispatcherId = null;
  _tables[self.id] = self;
  self.generateSeats(numberOfSeats);
}

Table.prototype.setMediaPipeline = function ({ mediaPipeline }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Set "mediaPipeline"`);

  self.mediaPipeline = mediaPipeline;
  self.mediaPipelineId = mediaPipeline.id;
};

// Table.prototype.setComposite = function ({ composite }) {
//   const self = this;
//   logger.log(`[TABLE] Table <${self.id}> - Set "composite"`);

//   self.composite = composite;
//   self.compositeId = composite.id;
// };

Table.prototype.setDispatcher = function ({ dispatcher }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Set "dispatcher"`);

  self.dispatcher = dispatcher;
  self.dispatcherId = dispatcher.id;
};

Table.prototype.generateSeats = function (numberOfSeats = 1) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Generate ${numberOfSeats} Seat(s)`);

  for (let i = 0; i < numberOfSeats; i++) {
    _generateSeat.call(self);
  }
};

Table.prototype.removeSeat = function ({ seatNumber }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Remove Seat <${seatNumber}>`);

  self.seats[seatNumber] = "removed";
};

Table.prototype.changeSource = function (source) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Change Source`);

  self.source = source;
};

Table.prototype.join = function ({ knight, king }) {
  const self = this;
  let socketId = null;
  if (king) {
    logger.log(`[TABLE] Table <${self.id}> - King <${king.id}> Joined`);

    self.king = { id: king.id, name: king.name };
    self.knights[king.id] = { id: king.id, name: king.name };
    self.source = king.id;
    socketId = king.id;
  } else if (knight) {
    logger.log(`[TABLE] Table <${self.id}> - Knight <${knight.id}> Joined`);

    if (
      !self.seats[knight.seatNumber] ||
      self.seats[knight.seatNumber] !== "available"
    )
      throw new Error("Invalid seatNumber");
    self.knights[knight.id] = {
      id: knight.id,
      name: knight.name,
      seatNumber: knight.seatNumber,
    };
    self.seats[knight.seatNumber] = knight.id;
    socketId = knight.id;
  } else {
    throw new Error("No member joined");
  }

  return new Promise((resolve, reject) => {
    io.adapter.remoteJoin(socketId, self.id, (error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
};

Table.prototype.connect = function ({ knight }) {
  const self = this;
  if (knight) {
    logger.log(`[TABLE] Table <${self.id}> - Knight <${knight.id}> connected`);

    if (!self.knights[knight.id]) throw new Error("Knight not joined");

    self.knights[knight.id].isConnected = true;
  } else {
    throw new Error("No member connected");
  }
};

Table.prototype.leave = function ({ socketId, remove }) {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Knight <${socketId}> Left`);

  if (!self.knights[socketId] || !self.knights[socketId].seatNumber) return;

  const seatNumber = self.knights[socketId].seatNumber;

  if (self.seats[seatNumber] === self.knights[socketId].id)
    self.seats[seatNumber] = remove ? "removed" : "available";

  delete self.knights[socketId];

  return new Promise((resolve, reject) => {
    io.adapter.remoteLeave(socketId, self.id, (error) => {
      if (error) logger.error(error);
      return resolve();
    });
  });
};

Table.prototype.release = function () {
  const self = this;
  logger.log(`[TABLE] Table <${self.id}> - Release`);

  if (self.mediaPipeline) {
    self.mediaPipeline.release();
    self.mediaPipeline = null;
    self.mediaPipelineId = null;
  }
  // if (self.composite) {
  //   self.composite.release();
  //   self.composite = null;
  //   self.compositeId = null;
  // }
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
    seats: self.seats,
    mediaPipelineId: self.mediaPipelineId,
    // compositeId: self.compositeId,
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
      seats: self.seats,
    };

  return {
    id: self.id,
    king: self.king,
    knights: self.knights,
    source: self.source,
  };
};

module.exports = { Table, getTables, getTable, parseSeatNumber };
