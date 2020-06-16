// const io = require("../utils/socketIo").getIo();
const logger = require("../utils/logger");
const {
  reserve,
  // release,
  join,
  leave,
  connect,
  changeSource,
  generateSeats,
  kickout,
  onIceCandidate,
} = require("./roundTable");

module.exports = (io) => {
  io.on("connect", (socket) => {
    logger.log(`[CONNECTION] Socket <${socket.id}> - Connect`);

    // error handle
    socket.on("error", (error) => {
      logger.error(`[CONNECTION] Socket <${socket.id}> - Error: `, error);
      leave({ socket });
    });

    socket.on("disconnect", () => {
      logger.log(`[CONNECTION] Socket <${socket.id}> - Disconnect`);
      leave({ socket });
    });

    socket.on("message", (message) => {
      logger.log(`[CONNECTION] Socket <${socket.id}> - Message: ${message.id}`);

      switch (message.id) {
        case "reserve":
          // TODO: who can reserve table
          reserve({
            socket,
            name: message.name || "Knight",
            numberOfSeats: message.numberOfSeats || 10,
          })
            .then((table) => {
              socket.send({
                id: "startCommunication",
                table,
                self: table.king,
              });
            })
            .catch((error) => {
              logger.error(`[Error] Socket <${socket.id}> Reserve Error: `);
              logger.error(error);
              socket.send({
                id: "error",
                message: `Fail to reserve table`,
                error,
              });
            });
          break;

        // case "release":
        //   // TODO: who can release table
        //   release({ socket });
        //   break;

        case "join":
          join({
            socket,
            name: message.name || "Knight",
            seatNumber: message.seatNumber,
          })
            .then((table) => {
              socket.send({
                id: "startCommunication",
                table,
                self: table.knights[socket.id],
              });
            })
            .catch((error) => {
              logger.error(`[Error] Socket <${socket.id}> Join Error: `);
              logger.error(error);
              socket.send({
                id: "error",
                message: `Fail to join table`,
                error,
              });
            });
          break;

        case "leave":
          leave({ socket });
          break;

        case "connect":
          connect({
            socket,
            source: message.source,
            sdpOffer: message.sdpOffer,
          })
            .then((sdpAnswer) => {
              socket.send({
                id: "connectResponse",
                response: "success",
                source: message.source,
                sdpAnswer,
              });
            })
            .catch((error) => {
              logger.error(`[Error] Socket <${socket.id}> Connect Error: `);
              logger.error(error);
              socket.send({
                id: "connectResponse",
                response: "fail",
                source: message.source,
                error,
              });
            });
          break;

        case "changeSource":
          // TODO: who can changeSource
          changeSource({ socket, source: message.source });
          break;

        case "generateSeats":
          // TODO: who can generateSeats
          generateSeats({ socket, numberOfSeats: message.numberOfSeats || 1 });
          break;

        case "kickout":
          // TODO: who can kickout
          kickout({ socket, seatNumber: message.seatNumber });
          break;

        case "onIceCandidate":
          onIceCandidate({
            socket,
            source: message.source,
            candidate: message.candidate,
          });
          break;

        default:
          socket.send({
            id: "error",
            message: `Invalid message: ${message.id}`,
          });
          break;
      }
    });
  });
};
