const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');

function formatMongooseValidationError(err) {
  const errors = Object.values(err.errors || {}).map((e) => ({
    field: e.path,
    message: e.message,
  }));
  return new ApiError(400, 'Validation failed', errors);
}

function formatDuplicateKeyError(err) {
  const fields = Object.keys(err.keyValue || {});
  const field = fields[0] || 'field';
  const message = field === 'email' ? 'Email already exists' : `Duplicate value for ${field}`;
  return new ApiError(409, message, [{ field, message }]);
}

function formatCastError(err) {
  // Commonly invalid ObjectId in params/body
  const field = err.path || 'id';
  return new ApiError(400, `Invalid ${field}`, [{ field, message: `Invalid ${field}` }]);
}

function normalizeError(err) {
  if (err instanceof ApiError) return err;

  // Mongoose errors
  if (err instanceof mongoose.Error.ValidationError) return formatMongooseValidationError(err);
  if (err instanceof mongoose.Error.CastError) return formatCastError(err);

  // Mongo duplicate key
  if (err && (err.code === 11000 || err.code === 11001)) return formatDuplicateKeyError(err);

  // JWT errors (in case thrown without ApiError wrapper)
  if (err && err.name === 'TokenExpiredError') return new ApiError(401, 'Authentication token has expired');
  if (err && (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError')) {
    return new ApiError(401, 'Invalid authentication token');
  }

  // Body parser / syntax errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return new ApiError(400, 'Invalid JSON request body');
  }

  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode >= 500 ? 'Internal server error' : err.message || 'Request failed';
  return new ApiError(statusCode, message, [], false);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const normalized = normalizeError(err);
  const isProduction = (process.env.NODE_ENV || 'development') === 'production';

  if (!isProduction && normalized.statusCode >= 500) {
    console.error('Unhandled error:', err);
  }

  const response = {
    success: false,
    message: normalized.message,
  };

  if (normalized.errors && normalized.errors.length > 0) {
    response.errors = normalized.errors;
  }

  // Never expose stack traces or sensitive details in production responses
  if (!isProduction && normalized.statusCode >= 500) {
    response.error = {
      name: err.name,
      message: err.message,
    };
  }

  res.status(normalized.statusCode).json(response);
}

module.exports = errorHandler;
