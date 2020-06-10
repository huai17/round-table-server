const kurento = require("kurento-client");
const io = require("../utils/socketIo").getIo();
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

const reserve = ({ numberOfSeats = 10 }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`Proccess - reserve table`);
    let table = null;
    let mediaPipeline = null;
    let composite = null;
    let dispatcher = null;
    try {
      mediaPipeline = await createMediaPipeline();
      composite = await createComposite(mediaPipeline);
      dispatcher = await createDispatcher(mediaPipeline);
      table = new Table({ numberOfSeats });
      console.log(mediaPipeline);
      table.setMediaPipeline({ mediaPipeline });
      table.setComposite({ composite });
      table.setDispatcher({ dispatcher });
      return resolve(table.toObject());
    } catch (error) {
      if (composite) composite.release();
      if (dispatcher) dispatcher.release();
      if (mediaPipeline) mediaPipeline.release();
      if (table) table.release();
      return reject(error);
    }
  });

const release = ({ tableId }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`Proccess - release table: ${tableId}`);
    const table = getTable(tableId);
    if (!table) return resolve();
    table.release();
    for (let socketId of table.participants) {
      io.to(socketId).send({ id: "stopCommunication" });
    }
    return resolve();
  });

const join = ({ socket, seatNumber, name, sdpOffer }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`Proccess - join table`);
    let table = null;
    let knight = null;
    let webRtcEndpoint = null;
    let hubPort = null;

    try {
      const [tableId, serialNumber] = parseSeatNumber(seatNumber);
      table = getTable(tableId);
      if (!table) return reject("Table not exists.");
      table.join({ socketId: socket.id, seatNumber });
      knight = new Knight({
        socket,
        name: `${name}#${serialNumber}`,
        table,
      });

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
        socket.send({ id: "iceCandidate", source: "me", candidate });
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
          return resolve(sdpAnswer);
        }
      );
      knight.webRtcEndpoints["me"].gatherCandidates((error) => {
        if (error) return reject(error);
      });

      const participantIds = [];

      for (let socketId of table.participants) {
        if (socketId !== socket.id) {
          participantIds.push(socketId);
          io.to(socketId).send({
            id: "participantJoined",
            participantId: socket.id,
          });
        }
      }

      socket.send({ id: "existParticipants", participantIds });
    } catch (error) {
      if (table) table.leave({ socketId: socket.id });
      if (knight) knight.unregister();
      if (webRtcEndpoint) {
        webRtcEndpoint.release();
        webRtcEndpoint = null;
      }
      if (hubPort) {
        hubPort.release();
        hubPort = null;
      }
      return reject(error);
    }
  });

const leave = ({ socket }) =>
  new Promise(async (resolve, reject) => {
    logger.log(`Proccess - leave knight: ${socket.id}`);
    const knight = getKnight(socket.id);
    if (!knight) return resolve();
    if (knight.table) {
      knight.table.leave({ socketId: socket.id });
      for (let socketId of knight.table.participants) {
        const listener = getKnight(socketId);
        if (!listener) continue;
        if (listener.webRtcEndpoints[socket.id]) {
          listener.webRtcEndpoints[socket.id].release();
          delete listener.webRtcEndpoints[socket.id];
          delete listener.webRtcEndpointIds[socket.id];
        }
        io.to(socketId).send({
          id: "participantLeft",
          participantId: socket.id,
        });
      }
    }
    knight.unregister();
    socket.send({ id: "stopCommunication" });
    return resolve();
  });

const receive = ({ socket, source, sdpOffer }) =>
  new Promise(async (resolve, reject) => {
    let knight = null;
    let webRtcEndpoint = null;
    try {
      knight = getKnight(socket.id);
      if (!knight) throw new Error("Knight not exists.");
      if (!knight.table || !knight.table.mediaPipeline)
        throw new Error("Table not exists.");
      webRtcEndpoint = await createWebRtcEndPoint(knight.table.mediaPipeline);
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
      if (webRtcEndpoint) {
        webRtcEndpoint.release();
        webRtcEndpoint = null;
      }
      return reject(error);
    }
  });

const kickout = () => new Promise(async (resolve, reject) => {});

const onIceCandidate = ({ socket, source, candidate: _candidate }) => {
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

module.exports = { reserve, release, join, leave, receive, onIceCandidate };
