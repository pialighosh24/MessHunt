const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const healthRoutes = require('./routes/health.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { isLocalDemoMode } = require('./local-demo/config');

const app = express();

// Basic middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isDevelopment = (process.env.NODE_ENV || 'development') === 'development';

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without Origin header (mobile apps, curl/Postman, server-to-server)
      if (!origin) return callback(null, true);

      // In development, allow configured origins; if none configured, allow all for local dev convenience.
      if (configuredOrigins.length === 0) {
        return callback(null, isDevelopment);
      }

      if (configuredOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
  })
);

if (isDevelopment) {
  app.use(morgan('dev'));
}

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    application: 'Mess Hunt',
    tagline: 'Find Your Perfect Mess',
    message: 'Mess Hunt API is running',
    mode: isLocalDemoMode() ? 'local-demo' : 'mongo',
  });
});

app.use('/api/health', healthRoutes);

if (isLocalDemoMode()) {
  // Local demo mode: persistent file-backed API, no MongoDB connection.
  const localDemoRoutes = require('./local-demo/routes');
  const { getUploadsDir } = require('./local-demo/config');
  // Serve locally uploaded demo photos through controlled static path
  app.use('/api/local-uploads', express.static(getUploadsDir(), { dotfiles: 'deny', index: false }));
  app.use('/api', localDemoRoutes);
} else {
  // MongoDB/Mongoose mode (existing implementation)
  const authRoutes = require('./routes/auth.routes');
  const studentRoutes = require('./routes/student.routes');
  const ownerRoutes = require('./routes/owner.routes');
  const publicAccommodationRoutes = require('./routes/publicAccommodation.routes');
  const accommodationReviewRoutes = require('./routes/accommodationReview.routes');
  const reviewRoutes = require('./routes/review.routes');
  const adminRoutes = require('./routes/admin.routes');

  app.use('/api/auth', authRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/owners', ownerRoutes);
  // Accommodation-scoped review endpoints (public list + student create) and public accommodation endpoints
  app.use('/api/accommodations', accommodationReviewRoutes);
  app.use('/api/accommodations', publicAccommodationRoutes);
  // Review-specific endpoints (owner edit/delete, student report)
  app.use('/api/reviews', reviewRoutes);
  // Admin APIs (Step 8)
  app.use('/api/admin', adminRoutes);
}

// 404 and centralized error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
