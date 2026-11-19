const express = require('express');
const { getAppMode, isLocalDemoMode } = require('../local-demo/config');

const router = express.Router();

router.get('/', (req, res) => {
  const base = {
    success: true,
    application: 'Mess Hunt',
    tagline: 'Find Your Perfect Mess',
    mode: getAppMode(),
    server: {
      status: 'running',
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
    },
    timestamp: new Date().toISOString(),
  };

  if (isLocalDemoMode()) {
    const { getLocalDemoStatus } = require('../local-demo/runtime');
    base.database = {
      mode: 'local-demo',
      connected: false,
      state: 'not_used',
      message: 'MongoDB is not connected in local-demo mode.',
    };
    base.storage = getLocalDemoStatus();
    return res.status(200).json(base);
  }

  const { getDbStatus } = require('../config/db');
  const db = getDbStatus();
  base.database = {
    connected: db.connected,
    status: db.state,
    readyState: db.readyState,
    ...(db.connected && db.name ? { name: db.name } : {}),
  };
  return res.status(200).json(base);
});

module.exports = router;
