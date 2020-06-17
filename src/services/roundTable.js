const kurento = require("kurento-client");
const logger = require("../utils/logger");
const io = require("../utils/socketIo").getNameSpace("/roundTable");
const {
  createMediaPipeline,
  createWebRtcEndPoint,
  // createComposite,
  createDispatcher,
  createHubPort,
} = require("../utils/kurentoUtils");
const { Knight, getKnight } = require("../sessions/knights");
const { Table, getTable, parseSeatNumber } = require("../sessions/tables");

const reserve = ({ socket, name = "Knight", numberOfSeats = 10 }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Reserve Table`);

    let table = null;
    let mediaPipeline = null;
    // let composite = null;
    let dispatcher = null;
    let king = null;
    let hubPort = null;

    try {
      // init new table
      table = new Table({ numberOfSeats });

      mediaPipeline = await createMediaPipeline();
      table.setMediaPipeline({ mediaPipeline });
      mediaPipeline = null;

      // composite = await createComposite(table.mediaPipeline);
      // table.setComposite({ composite });
      // composite = null;

      dispatcher = await createDispatcher(table.mediaPipeline);
      table.setDispatcher({ dispatcher });
      dispatcher = null;

      // init new king
      king = new Knight({
        socket,
        name: `${name}#admin`,
        table,
      });
      await table.join({ king });

      // hubPort = await createHubPort(table.composite);
      // king.setHubPort({ source: "composite", hubPort });
      // hubPort = null;

      hubPort = await createHubPort(table.dispatcher);
      king.setHubPort({ source: "dispatcher", hubPort });
      hubPort = null;

      // set host as dispatcher source
      table.dispatcher.setSource(king.hubPortIds["dispatcher"]);

      return resolve(table.toObject(true));
    } catch (error) {
      // if (composite) composite.release();
      if (dispatcher) dispatcher.release();
      if (mediaPipeline) mediaPipeline.release();
      if (hubPort) hubPort.release();
      if (table) table.release();
      if (king) king.unregister();

      return reject(error);
    }
  });

const release = ({ socket }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Release Table`);

    const king = getKnight(socket.id);
    if (!king) return resolve();
    const table = getTable(king.tableId);
    if (!table) return resolve();
    if (!table.king || table.king.id !== king.id) return resolve();
    table.release();
    for (let socketId in table.knights) {
      const knight = getKnight(socketId);
      if (knight) {
        knight.send({ id: "stopCommunication" });
        knight.unregister();
      }
    }
    return resolve();
  });

const join = ({ socket, seatNumber, name }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Join Table`);

    let table = null;
    let knight = null;
    let hubPort = null;

    try {
      const [tableId, serialNumber] = parseSeatNumber(seatNumber);
      table = getTable(tableId);
      if (!table) return reject("Table not exists.");

      // init new knight
      knight = new Knight({
        socket,
        name: `${name}#${serialNumber}`,
        table,
        seatNumber,
      });
      await table.join({ knight });

      // hubPort = await createHubPort(table.composite);
      // king.setHubPort({ source: "composite", hubPort });
      // hubPort = null;

      hubPort = await createHubPort(table.dispatcher);
      knight.setHubPort({ source: "dispatcher", hubPort });
      hubPort = null;

      socket.to(table.id).send({
        id: "knightJoined",
        knight: knight.toObject(),
      });

      return resolve(table.toObject(false));
    } catch (error) {
      if (table) table.leave({ socketId: socket.id });
      if (knight) knight.unregister();
      if (hubPort) hubPort.release();

      return reject(error);
    }
  });

const leave = ({ socket }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Leave Table`);

    const knight = getKnight(socket.id);
    if (!knight) return resolve();
    const table = getTable(knight.tableId);
    if (table) {
      if (table.king && table.king.id === knight.id) {
        await release({ socket });
        return resolve();
      }

      let sourceChanged = false;
      if (table.source === socket.id && table.king) {
        const king = getKnight(table.king.id);

        if (king && king.hubPortIds["dispatcher"]) {
          // set host as dispatcher source
          table.dispatcher.setSource(king.hubPortIds["dispatcher"]);
          table.changeSource(king.id);

          sourceChanged = true;
        }
      }
      await table.leave({ socketId: socket.id });

      if (sourceChanged)
        io.in(table.id).send({
          id: "changeSource",
          source: table.king.id,
        });

      io.in(table.id).send({
        id: "knightLeft",
        knight: knight.toObject(),
        isRemoved: false,
      });

      for (let socketId in table.knights) {
        const listener = getKnight(socketId);
        if (listener) {
          if (listener.webRtcEndpoints[socket.id]) {
            listener.webRtcEndpoints[socket.id].release();
            delete listener.webRtcEndpoints[socket.id];
            delete listener.webRtcEndpointIds[socket.id];
          }
        }
      }
    }
    knight.send({ id: "stopCommunication" });
    knight.unregister();
    return resolve();
  });

const connect = ({ socket, source, sdpOffer }) =>
  new Promise(async (resolve, reject) => {
    logger.log(
      `[ROUND TABLE] Socket <${socket.id}> - Connect Source: ${source}`
    );

    let webRtcEndpoint = null;

    try {
      const knight = getKnight(socket.id);
      if (!knight) throw new Error("Knight not exists.");
      const table = getTable(knight.tableId);
      if (!table || !table.mediaPipeline) throw new Error("Table not exists.");

      webRtcEndpoint = await createWebRtcEndPoint(table.mediaPipeline);
      if (knight.candidatesQueue[source]) {
        while (knight.candidatesQueue[source].length) {
          const candidate = knight.candidatesQueue[source].shift();
          webRtcEndpoint.addIceCandidate(candidate);
        }
      }
      webRtcEndpoint.on("OnIceCandidate", (event) => {
        const candidate = kurento.getComplexType("IceCandidate")(
          event.candidate
        );
        socket.send({ id: "iceCandidate", source, candidate });
      });
      knight.setWebRtcEndpoint({ source, webRtcEndpoint });
      webRtcEndpoint = null;

      let target = null;
      switch (source) {
        case "self":
          if (knight.hubPorts["dispatcher"]) {
            knight.webRtcEndpoints["self"].connect(
              knight.hubPorts["dispatcher"]
            );
          }

          // if (knight.hubPorts["composite"]) {
          //   knight.webRtcEndpoints["self"].connect(knight.hubPorts["composite"]);
          // }

          table.connect({ knight });
          socket.to(table.id).send({
            id: "knightConnected",
            knight: knight.toObject(),
          });

          target = true;
          break;

        case "dispatcher":
          if (knight.hubPorts[source]) {
            knight.hubPorts[source].connect(knight.webRtcEndpoints[source]);
            target = true;
          } else target = false;
          break;

        // case "composite":
        //   if (knight.hubPorts[source]) {
        //     knight.hubPorts[source].connect(knight.webRtcEndpoints[source]);
        //     target = true;
        //   } else target = false;
        //   break;

        default:
          target = getKnight(source);
          if (target && target.webRtcEndpoints["self"]) {
            target.webRtcEndpoints["self"].connect(
              knight.webRtcEndpoints[source]
            );
            target = true;
          } else target = false;
      }

      if (target) {
        knight.webRtcEndpoints[source].processOffer(
          sdpOffer,
          (error, sdpAnswer) => {
            if (error) return reject(error);
            return resolve(sdpAnswer);
          }
        );
        knight.webRtcEndpoints[source].gatherCandidates((error) => {
          if (error) return reject(error);
        });
      } else {
        knight.webRtcEndpoints[source].release();
        knight.webRtcEndpoints[source] = null;
        return reject(`Source <${source}> not exists`);
      }
    } catch (error) {
      leave({ socket });
      if (webRtcEndpoint) webRtcEndpoint.release();

      return reject(error);
    }
  });

const changeSource = ({ socket, source }) =>
  new Promise(async (resolve, reject) => {
    logger.log(
      `[ROUND TABLE] Socket <${socket.id}> - Change Source: ${source}`
    );

    const king = getKnight(socket.id);
    if (!king) return resolve();
    const table = getTable(king.tableId);
    if (!table || !table.dispatcher || !table.king || table.king.id !== king.id)
      return resolve();

    if (source === "self") {
      if (!king.hubPortIds["dispatcher"]) return resolve();

      // set host as dispatcher source
      table.dispatcher.setSource(king.hubPortIds["dispatcher"]);
      table.changeSource(king.id);
    } else {
      const target = getKnight(source);
      if (!target || !target.hubPortIds["dispatcher"]) return resolve();

      // set target as dispatcher source
      table.dispatcher.setSource(target.hubPortIds["dispatcher"]);
      table.changeSource(target.id);
    }

    io.in(table.id).send({
      id: "changeSource",
      source: source === "self" ? king.id : source,
    });

    return resolve();
  });

const generateSeats = ({ socket, numberOfSeats = 1 }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Generate Seats`);

    const king = getKnight(socket.id);
    if (!king) return resolve();
    const table = getTable(king.tableId);
    if (!table || !table.dispatcher || !table.king || table.king.id !== king.id)
      return resolve();

    table.generateSeats(numberOfSeats);

    king.send({
      id: "seatsUpdated",
      seats: table.seats,
      numberOfSeats: table.numberOfSeats,
    });

    return resolve();
  });

const kickout = ({ socket, seatNumber }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Generate Seats`);

    const king = getKnight(socket.id);
    if (!king) return resolve();
    const table = getTable(king.tableId);
    if (!table || !table.dispatcher || !table.king || table.king.id !== king.id)
      return resolve();

    if (
      !table.seats[seatNumber] ||
      table.seats[seatNumber] === "available" ||
      table.seats[seatNumber] === "removed"
    )
      return resolve();

    const knight = getKnight(table.seats[seatNumber]);
    if (!knight) return resolve();

    let sourceChanged = false;
    if (table.source === knight.id && king.hubPortIds["dispatcher"]) {
      // set host as dispatcher source
      table.dispatcher.setSource(king.hubPortIds["dispatcher"]);
      table.changeSource(king.id);

      sourceChanged = true;
    }
    await table.leave({ socketId: knight.id, remove: true });
    // table.removeSeat({ seatNumber });

    if (sourceChanged)
      io.in(table.id).send({
        id: "changeSource",
        source: table.king.id,
      });

    io.in(table.id).send({
      id: "knightLeft",
      knight: knight.toObject(),
      isRemoved: true,
    });

    for (let socketId in table.knights) {
      const listener = getKnight(socketId);
      if (listener) {
        if (listener.webRtcEndpoints[knight.id]) {
          listener.webRtcEndpoints[knight.id].release();
          delete listener.webRtcEndpoints[knight.id];
          delete listener.webRtcEndpointIds[knight.id];
        }
      }
    }

    knight.send({ id: "stopCommunication" });
    knight.unregister();
    return resolve();
  });

const onIceCandidate = ({ socket, source, candidate: _candidate }) => {
  logger.log(
    `[ROUND TABLE] Socket <${socket.id}> - ICE Candidate Of Source: ${source}`
  );

  const candidate = kurento.getComplexType("IceCandidate")(_candidate);
  const knight = getKnight(socket.id);
  if (!knight) return;
  if (knight.webRtcEndpoints[source]) {
    knight.webRtcEndpoints[source].addIceCandidate(candidate);
  } else {
    if (!knight.candidatesQueue[source]) knight.candidatesQueue[source] = [];
    knight.candidatesQueue[source].push(candidate);
  }
};

module.exports = {
  reserve,
  // release,
  join,
  leave,
  connect,
  changeSource,
  generateSeats,
  kickout,
  onIceCandidate,
};
