const { getAppMode, isLocalDemoMode } = require('./config');
const { getStoreMeta, getStoreFilePath } = require('./store');

let _ready = false;
let _error = null;

function markReady() {
  _ready = true;
  _error = null;
}

function markError(err) {
  _ready = false;
  _error = err ? (err.message || String(err)) : 'Unknown local demo initialization error';
}

function getLocalDemoStatus() {
  if (!isLocalDemoMode()) {
    return {
      mode: getAppMode(),
      ready: false,
      storePath: null,
    };
  }

  let meta = null;
  try {
    meta = getStoreMeta();
  } catch (_) {
    meta = null;
  }

  return {
    mode: 'local-demo',
    connected: _ready, // compatibility field for health reporting
    ready: _ready,
    state: _ready ? 'ready' : (_error ? 'error' : 'initializing'),
    error: _error,
    storePath: getStoreFilePath(),
    storeUpdatedAt: meta && meta.updatedAt ? meta.updatedAt : null,
  };
}

module.exports = {
  markReady,
  markError,
  getLocalDemoStatus,
};
