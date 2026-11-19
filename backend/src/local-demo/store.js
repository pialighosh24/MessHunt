const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {
  getStoreDir,
  getStoreFilePath,
  getLocalDataDir,
  getUploadsDir,
  getAccommodationUploadsDir,
  getBackupsDir,
} = require('./config');

const STORE_VERSION = 1;

const EMPTY_STORE = Object.freeze({
  meta: {
    version: STORE_VERSION,
    createdAt: null,
    updatedAt: null,
  },
  students: [],
  owners: [],
  admins: [],
  accommodations: [],
  reviews: [],
});

let _state = null;
let _initialized = false;
let _writeQueue = Promise.resolve();
let _storeMtimeMs = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureRuntimeDirs() {
  await ensureDir(getLocalDataDir());
  await ensureDir(getStoreDir());
  await ensureDir(getUploadsDir());
  await ensureDir(getAccommodationUploadsDir());
  await ensureDir(getBackupsDir());
}

function normalizeStoreShape(raw) {
  const base = clone(EMPTY_STORE);
  if (!raw || typeof raw !== 'object') return base;
  const store = {
    meta: {
      ...base.meta,
      ...(raw.meta && typeof raw.meta === 'object' ? raw.meta : {}),
      version: STORE_VERSION,
    },
    students: Array.isArray(raw.students) ? raw.students : [],
    owners: Array.isArray(raw.owners) ? raw.owners : [],
    admins: Array.isArray(raw.admins) ? raw.admins : [],
    accommodations: Array.isArray(raw.accommodations) ? raw.accommodations : [],
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
  };
  if (!store.meta.createdAt) store.meta.createdAt = nowIso();
  if (!store.meta.updatedAt) store.meta.updatedAt = store.meta.createdAt;
  return store;
}

async function readStoreFromDisk() {
  const filePath = getStoreFilePath();
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeStoreShape(parsed);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      const fresh = normalizeStoreShape(clone(EMPTY_STORE));
      fresh.meta.createdAt = nowIso();
      fresh.meta.updatedAt = fresh.meta.createdAt;
      await writeStoreToDisk(fresh);
      return fresh;
    }
    throw err;
  }
}

async function writeStoreToDisk(store) {
  const filePath = getStoreFilePath();
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = path.join(dir, `.store.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`);
  const json = JSON.stringify(store, null, 2) + '\n';
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(json, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fsp.rename(tmp, filePath);
  try {
    const stat = await fsp.stat(filePath);
    _storeMtimeMs = stat.mtimeMs || Date.now();
  } catch (_) {
    _storeMtimeMs = Date.now();
  }
}

function getState() {
  if (!_initialized || !_state) {
    throw new Error('Local demo store is not initialized. Ensure APP_MODE=local-demo and server initialization completed.');
  }
  return _state;
}

async function initStore() {
  if (_initialized && _state) return _state;
  await ensureRuntimeDirs();
  _state = await readStoreFromDisk();
  _initialized = true;
  try {
    const stat = await fsp.stat(getStoreFilePath());
    _storeMtimeMs = stat.mtimeMs || Date.now();
  } catch (_) {
    _storeMtimeMs = Date.now();
  }
  return _state;
}

async function withWriteLock(fn) {
  const run = async () => {
    if (!_initialized) await initStore();
    // Reload from disk if another process/operation modified the file (best-effort safety)
    try {
      const stat = await fsp.stat(getStoreFilePath());
      if (stat.mtimeMs && stat.mtimeMs > _storeMtimeMs) {
        _state = normalizeStoreShape(await readStoreFromDisk());
      }
    } catch (_) {
      // ignore; proceed with in-memory state
    }
    const result = await fn(_state);
    _state.meta.updatedAt = nowIso();
    await writeStoreToDisk(_state);
    return result;
  };
  const queued = _writeQueue.then(run, run);
  // Keep queue alive regardless of failure
  _writeQueue = queued.catch(() => {});
  return queued;
}

async function backupStore(reason = 'manual') {
  if (!_initialized) await initStore();
  await ensureDir(getBackupsDir());
  const safeReason = String(reason || 'manual').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40) || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `store-backup-${stamp}-${safeReason}.json`;
  const dest = path.join(getBackupsDir(), name);
  await fsp.copyFile(getStoreFilePath(), dest);
  return dest;
}

function getCollections() {
  const state = getState();
  return {
    students: state.students,
    owners: state.owners,
    admins: state.admins,
    accommodations: state.accommodations,
    reviews: state.reviews,
  };
}

function getStoreMeta() {
  return { ...(getState().meta || {}) };
}

async function resetStore({ backup = true } = {}) {
  if (!_initialized) await initStore();
  return withWriteLock(async (state) => {
    if (backup) {
      await backupStore('before-reset');
    }
    const fresh = normalizeStoreShape(clone(EMPTY_STORE));
    fresh.meta.createdAt = nowIso();
    fresh.meta.updatedAt = fresh.meta.createdAt;
    state.meta = fresh.meta;
    state.students = fresh.students;
    state.owners = fresh.owners;
    state.admins = fresh.admins;
    state.accommodations = fresh.accommodations;
    state.reviews = fresh.reviews;
    return clone(state.meta);
  });
}

module.exports = {
  STORE_VERSION,
  initStore,
  getState,
  getCollections,
  getStoreMeta,
  withWriteLock,
  backupStore,
  resetStore,
  ensureRuntimeDirs,
  getStoreFilePath,
};
