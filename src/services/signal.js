const io = require("../utils/socketIo").getIo();
const logger = require("../utils/logger");
const {
  reserve,
  release,
  join,
  leave,
  receive,
  onIceCandidate,
} = require("./roundTable");

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
          sdpOffer: message.sdpOffer,
          numberOfSeats: message.numberOfSeats || 10,
        })
          .then(({ sdpAnswer, table }) => {
            socket.send({
              id: "reserveResponse",
              response: "success",
              sdpAnswer,
              table,
            });
          })
          .catch((error) => {
            logger.error(`[Error] Socket <${socket.id}> - Error: `, error);
            socket.send({
              id: "reserveResponse",
              response: "fail",
              error,
            });
          });
        break;

      case "release":
        // TODO: who can release table
        release({ socket });
        break;

      case "join":
        join({
          socket,
          seatNumber: message.token,
          name: message.name || "Knight",
          sdpOffer: message.sdpOffer,
        })
          .then((sdpAnswer) => {
            socket.send({
              id: "joinResponse",
              response: "success",
              token: message.token,
              sdpAnswer,
            });
          })
          .catch((error) => {
            logger.error(`[Error] Socket <${socket.id}> - Error: `, error);
            socket.send({
              id: "joinResponse",
              response: "fail",
              token: message.token,
              error,
            });
          });
        break;

      case "leave":
        leave({ socket });
        break;

      case "receive":
        receive({ socket, source: message.source, sdpOffer: message.sdpOffer })
          .then((sdpAnswer) => {
            socket.send({
              id: "receiveResponse",
              response: "success",
              source: message.source,
              sdpAnswer,
            });
          })
          .catch((error) => {
            logger.error(`[Error] Socket <${socket.id}> - Error: `, error);
            socket.send({
              id: "receiveResponse",
              response: "fail",
              source: message.source,
              error,
            });
          });
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
