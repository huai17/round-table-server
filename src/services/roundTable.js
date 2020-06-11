const kurento = require("kurento-client");
const logger = require("../utils/logger");
const {
  createMediaPipeline,
  createWebRtcEndPoint,
  createComposite,
  createDispatcher,
  createHubPort,
} = require("../utils/kurentoUtils");
const { Knight, getKnight } = require("../sessions/knights");
const { Table, getTable, parseSeatNumber } = require("../sessions/tables");

const reserve = ({ socket, name = "Knight", sdpOffer, numberOfSeats = 10 }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Reserve Table`);

    let table = null;
    let mediaPipeline = null;
    let composite = null;
    let dispatcher = null;
    let king = null;
    let webRtcEndpoint = null;
    let hubPort = null;

    try {
      // init new table
      table = new Table({ numberOfSeats });

      mediaPipeline = await createMediaPipeline();
      table.setMediaPipeline({ mediaPipeline });
      mediaPipeline = null;

      composite = await createComposite(table.mediaPipeline);
      table.setComposite({ composite });
      composite = null;

      dispatcher = await createDispatcher(table.mediaPipeline);
      table.setDispatcher({ dispatcher });
      dispatcher = null;

      // init new king
      king = new Knight({
        socket,
        name: `${name}#admin`,
        table,
      });
      table.join({ king });

      webRtcEndpoint = await createWebRtcEndPoint(table.mediaPipeline);
      if (king.candidatesQueue["me"]) {
        while (king.candidatesQueue["me"].length) {
          const candidate = king.candidatesQueue["me"].shift();
          webRtcEndpoint.addIceCandidate(candidate);
        }
      }
      webRtcEndpoint.on("OnIceCandidate", (event) => {
        const candidate = kurento.getComplexType("IceCandidate")(
          event.candidate
        );
        king.send({ id: "iceCandidate", source: "me", candidate });
      });
      king.setWebRtcEndpoint({ source: "me", webRtcEndpoint });
      webRtcEndpoint = null;

      hubPort = await createHubPort(table.composite);
      king.setHubPort({ source: "composite", hubPort });
      hubPort = null;

      hubPort = await createHubPort(table.dispatcher);
      king.setHubPort({ source: "dispatcher", hubPort });
      hubPort = null;

      king.webRtcEndpoints["me"].connect(king.hubPorts["composite"]);
      king.webRtcEndpoints["me"].connect(king.hubPorts["dispatcher"]);
      king.webRtcEndpoints["me"].processOffer(sdpOffer, (error, sdpAnswer) => {
        if (error) return reject(error);
        return resolve({ sdpAnswer, table: table.toObject() });
      });
      king.webRtcEndpoints["me"].gatherCandidates((error) => {
        if (error) return reject(error);
      });

      // set host as dispatcher source
      table.dispatcher.setSource(king.hubPortIds["dispatcher"]);
    } catch (error) {
      if (composite) composite.release();
      if (dispatcher) dispatcher.release();
      if (mediaPipeline) mediaPipeline.release();
      if (webRtcEndpoint) webRtcEndpoint.release();
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

const join = ({ socket, seatNumber, name, sdpOffer }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[ROUND TABLE] Socket <${socket.id}> - Join Table`);

    let table = null;
    let knight = null;
    let webRtcEndpoint = null;
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
      });
      table.join({ knight, seatNumber });

      webRtcEndpoint = await createWebRtcEndPoint(table.mediaPipeline);
      if (knight.candidatesQueue["me"]) {
        while (knight.candidatesQueue["me"].length) {
          const candidate = knight.candidatesQueue["me"].shift();
          webRtcEndpoint.addIceCandidate(candidate);
        }
      }
      webRtcEndpoint.on("OnIceCandidate", (event) => {
        const candidate = kurento.getComplexType("IceCandidate")(
          event.candidate
        );
        knight.send({ id: "iceCandidate", source: "me", candidate });
      });
      knight.setWebRtcEndpoint({ source: "me", webRtcEndpoint });
      webRtcEndpoint = null;

      hubPort = await createHubPort(table.composite);
      knight.setHubPort({ source: "composite", hubPort });
      hubPort = null;

      hubPort = await createHubPort(table.dispatcher);
      knight.setHubPort({ source: "dispatcher", hubPort });
      hubPort = null;

      knight.webRtcEndpoints["me"].connect(knight.hubPorts["composite"]);
      knight.webRtcEndpoints["me"].connect(knight.hubPorts["dispatcher"]);
      knight.webRtcEndpoints["me"].processOffer(
        sdpOffer,
        (error, sdpAnswer) => {
          if (error) return reject(error);
          return resolve({ sdpAnswer, table: table.toObject(false) });
        }
      );
      knight.webRtcEndpoints["me"].gatherCandidates((error) => {
        if (error) return reject(error);
      });

      for (let socketId in table.knights) {
        if (socketId !== socket.id) {
          const listener = getKnight(socketId);
          listener.send({
            id: "knightJoined",
            knight: knight.toObject(),
          });
        }
      }
    } catch (error) {
      if (table) table.leave({ socketId: socket.id });
      if (knight) knight.unregister();
      if (webRtcEndpoint) webRtcEndpoint.release();
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
      table.leave({ socketId: socket.id });
      for (let socketId in table.knights) {
        const listener = getKnight(socketId);
        if (listener) {
          if (listener.webRtcEndpoints[socket.id]) {
            listener.webRtcEndpoints[socket.id].release();
            delete listener.webRtcEndpoints[socket.id];
            delete listener.webRtcEndpointIds[socket.id];
          }
          listener.send({
            id: "knightLeft",
            knight: knight.toObject(),
          });
        }
      }
    }
    knight.send({ id: "stopCommunication" });
    knight.unregister();
    return resolve();
  });

const receive = ({ socket, source, sdpOffer }) =>
  new Promise(async (resolve, reject) => {
    logger.log(
      `[ROUND TABLE] Socket <${socket.id}> - Receive Source: ${source}`
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
        case "composite":
          if (knight.hubPorts[source]) {
            knight.hubPorts[source].connect(knight.webRtcEndpoints[source]);
            target = true;
          } else target = false;
          break;
        case "dispatcher":
          if (knight.hubPorts[source]) {
            knight.hubPorts[source].connect(knight.webRtcEndpoints[source]);
            target = true;
          } else target = false;
          break;
        default:
          target = getKnight(source);
          if (target && target.webRtcEndpoints["me"]) {
            target.webRtcEndpoints["me"].connect(
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
        return reject("Source not exists");
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

    if (source === "me") {
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

    for (let socketId in table.knights) {
      const knight = getKnight(socketId);
      knight.send({
        id: "changeSource",
        source: source === "me" ? socket.id : source,
      });
    }
    return resolve();
  });

const kickout = () => new Promise(async (resolve, reject) => {});

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
  release,
  join,
  leave,
  receive,
  onIceCandidate,
  changeSource,
};
