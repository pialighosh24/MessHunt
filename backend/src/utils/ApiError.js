class ApiError extends Error {
  constructor(statusCode, message, errors = [], isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    this.errors = Array.isArray(errors) ? errors : errors ? [errors] : [];
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
