const redisAdapter = require("socket.io-redis");
const { REDIS_URI } = require("../configs/keys");

let _io = null;

const getIo = () => _io;

const setIo = (server) => {
  if (_io) return;
  _io = require("socket.io")(server, { pingTimeout: 60000 });
  // _io.adapter(redisAdapter({ host: REDIS_URI, port: 6379 }));
};

module.exports = { getIo, setIo };
