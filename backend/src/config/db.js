const mongoose = require('mongoose');

let connectionHandlersRegistered = false;
let isShuttingDown = false;

function getDbStatus() {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  const readyState = mongoose.connection.readyState;

  return {
    readyState,
    state: states[readyState] || 'unknown',
    connected: readyState === 1,
    name: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
  };
}

function registerConnectionHandlers() {
  if (connectionHandlersRegistered) return;
  connectionHandlersRegistered = true;

  mongoose.connection.on('connected', () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log('MongoDB connection established');
    }
  });

  mongoose.connection.on('error', (err) => {
    // Avoid logging credentials/URI; log only safe error details
    console.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    if (!isShuttingDown && process.env.NODE_ENV !== 'test') {
      console.warn('MongoDB disconnected');
    }
  });
}

async function connectDB(uri = process.env.MONGODB_URI) {
  registerConnectionHandlers();

  if (!uri) {
    throw new Error('MONGODB_URI is not defined. Set it in backend/.env (see backend/.env.example).');
  }

  // Mongoose v8: no deprecated connection options required here.
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  return getDbStatus();
}

async function disconnectDB() {
  isShuttingDown = true;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  isShuttingDown = false;
  return getDbStatus();
}

module.exports = connectDB;
module.exports.getDbStatus = getDbStatus;
module.exports.disconnectDB = disconnectDB;
module.exports.registerConnectionHandlers = registerConnectionHandlers;
