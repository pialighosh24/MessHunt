const path = require('path');

const APP_MODE_LOCAL_DEMO = 'local-demo';
const APP_MODE_MONGO = 'mongo';

function getAppMode() {
  const mode = String(process.env.APP_MODE || APP_MODE_MONGO).trim().toLowerCase();
  return mode === APP_MODE_LOCAL_DEMO ? APP_MODE_LOCAL_DEMO : APP_MODE_MONGO;
}

function isLocalDemoMode() {
  return getAppMode() === APP_MODE_LOCAL_DEMO;
}

function getBackendRoot() {
  // backend/src/local-demo/config.js -> backend/
  return path.resolve(__dirname, '..', '..');
}

function getLocalDataDir() {
  return path.join(getBackendRoot(), 'local-data');
}

function getStoreDir() {
  return path.join(getLocalDataDir(), 'store');
}

function getStoreFilePath() {
  return path.join(getStoreDir(), 'store.json');
}

function getUploadsDir() {
  return path.join(getLocalDataDir(), 'uploads');
}

function getAccommodationUploadsDir() {
  return path.join(getUploadsDir(), 'accommodations');
}

function getBackupsDir() {
  return path.join(getLocalDataDir(), 'backups');
}

function getMaxUploadSizeMb() {
  const n = Number(process.env.MAX_UPLOAD_SIZE_MB);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function getMaxPhotosPerAccommodation() {
  const n = Number(process.env.MAX_PHOTOS_PER_ACCOMMODATION);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

module.exports = {
  APP_MODE_LOCAL_DEMO,
  APP_MODE_MONGO,
  getAppMode,
  isLocalDemoMode,
  getBackendRoot,
  getLocalDataDir,
  getStoreDir,
  getStoreFilePath,
  getUploadsDir,
  getAccommodationUploadsDir,
  getBackupsDir,
  getMaxUploadSizeMb,
  getMaxPhotosPerAccommodation,
};
