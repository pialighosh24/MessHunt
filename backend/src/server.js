require('dotenv').config();

const http = require('http');
const app = require('./app');
const { isLocalDemoMode, getAppMode } = require('./local-demo/config');

const PORT = Number(process.env.PORT) || 5000;
let server;
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down Mess Hunt API gracefully...`);

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  } catch (err) {
    console.error('Error while closing HTTP server:', err.message);
  }

  if (!isLocalDemoMode()) {
    try {
      const { disconnectDB, getDbStatus } = require('./config/db');
      if (getDbStatus().readyState !== 0) {
        await disconnectDB();
        console.log('MongoDB disconnected gracefully');
      }
    } catch (err) {
      console.error('Error while disconnecting MongoDB:', err.message);
    }
  } else {
    // Local demo mode: file-backed store writes are serialized; no DB disconnect required.
    console.log('Local demo mode: no MongoDB connection to close.');
  }

  process.exit(exitCode);
}

async function startServer() {
  try {
    if (isLocalDemoMode()) {
      const { initStore } = require('./local-demo/store');
      const { markReady, markError } = require('./local-demo/runtime');
      try {
        await initStore();
        markReady();
        console.log('Local demo mode enabled: using persistent file-backed store (MongoDB not connected).');
      } catch (err) {
        markError(err);
        throw err;
      }
    } else {
      const connectDB = require('./config/db');
      await connectDB();
    }

    server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`Mess Hunt API server running on port ${PORT} (mode: ${getAppMode()})`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });

    process.on('SIGINT', () => shutdown('SIGINT', 0));
    process.on('SIGTERM', () => shutdown('SIGTERM', 0));

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled promise rejection:', reason instanceof Error ? reason.message : reason);
      shutdown('unhandledRejection', 1);
    });

    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err.message);
      shutdown('uncaughtException', 1);
    });
  } catch (error) {
    // Do not log URI/credentials or secrets.
    console.error('Failed to start Mess Hunt API server:', error.message);
    console.error('Server not started. Readiness is not assumed.');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, shutdown };
