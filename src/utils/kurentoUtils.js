const kurento = require("kurento-client");
const logger = require("./logger");
const { KURENTO_URI } = require("../configs/keys");

let _kurentoClient = null;

const _getKurentoClient = () =>
  new Promise((resolve, reject) => {
    if (_kurentoClient) return resolve(_kurentoClient);
    kurento(KURENTO_URI, (error, kurentoClient) => {
      if (error) return reject(error);
      _kurentoClient = kurentoClient;
      return resolve(_kurentoClient);
    });
  });

const getMediaObject = (id) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[KURENTO] Media Object <${id}> - Get`);
    try {
      const kurentoClient = await _getKurentoClient();
      kurentoClient.getMediaobjectById(id, (error, mediaObject) => {
        if (error) return reject(error);
        return resolve(mediaObject);
      });
    } catch (error) {
      return reject(error);
    }
  });

const createMediaPipeline = () =>
  new Promise(async (resolve, reject) => {
    logger.log(`[KURENTO] Create Media Pipeline`);
    try {
      const kurentoClient = await _getKurentoClient();
      kurentoClient.create("MediaPipeline", (error, mediaPipeline) => {
        if (error) return reject(error);
        return resolve(mediaPipeline);
      });
    } catch (error) {
      return reject(error);
    }
  });

const _createMediaObject = (mediaPipeline, type) =>
  new Promise(async (resolve, reject) => {
    try {
      mediaPipeline.create(type, (error, mediaObject) => {
        if (error) return reject(error);
        resolve(mediaObject);
      });
    } catch (error) {
      return reject(error);
    }
  });

const createWebRtcEndPoint = (mediaPipeline) => {
  logger.log(
    `[KURENTO] Media Pipline <${mediaPipeline.id}> - Create WebRtc Endpoint`
  );
  return _createMediaObject(mediaPipeline, "WebRtcEndpoint");
};

// const createComposite = (mediaPipeline) => {
//   logger.log(
//     `[KURENTO] Media Pipline <${mediaPipeline.id}> - Create Composite Hub`
//   );
//   return _createMediaObject(mediaPipeline, "Composite");
// };

const createDispatcher = (mediaPipeline) => {
  logger.log(
    `[KURENTO] Media Pipline <${mediaPipeline.id}> - Create Dispatcher(one to many) Hub`
  );
  return _createMediaObject(mediaPipeline, "DispatcherOneToMany");
};

const createHubPort = (hub) =>
  new Promise(async (resolve, reject) => {
    logger.log(`[KURENTO] Hub <${hub.id}> - Create Hub Port`);
    try {
      hub.createHubPort((error, hubPort) => {
        if (error) return reject(error);
        resolve(hubPort);
      });
    } catch (error) {
      return reject(error);
    }
  });

module.exports = {
  getMediaObject,
  createMediaPipeline,
  createWebRtcEndPoint,
  // createComposite,
  createDispatcher,
  createHubPort,
};
