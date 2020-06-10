const socketId = require("socket.io");
const redisAdapter = require("socket.io-redis");
const { REDIS_URI } = require("../configs/keys");

let _io = null;

const getIo = () => _io;

const setIo = (server) => {
  if (_io) return;
  const io = socketId(server, { pingTimeout: 60000 });
  io.adapter(redisAdapter({ host: REDIS_URI, port: 6379 }));
  _io = io;
};

module.exports = { getIo, setIo };
