let _mode = "silent";

const log = (message) => {
  if (_mode !== "silent") console.log(message);
};

const error = (message) => {
  console.error(message);
};

const info = (message) => {
  console.info(message);
};

const setMode = (mode) => {
  _mode = mode;
};

module.exports = { log, error, info, setMode };
