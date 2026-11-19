const ApiError = require('../utils/ApiError');
const {
  isValidEmail,
  isValidPassword,
  isValidObjectId,
  isValidRating,
  isValidUrl,
  isNonNegativeNumber,
  normalizeEmail,
  trimString,
} = require('../utils/validators');

function collectError(errors, field, message) {
  errors.push({ field, message });
}

function validateRequiredFields(fields = [], source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const errors = [];

    for (const field of fields) {
      const value = data[field];
      const missing =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');

      if (missing) {
        collectError(errors, field, `${field} is required`);
      }
    }

    if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
    return next();
  };
}

function validateEmailField(field = 'email', source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const value = data[field];

    if (value === undefined || value === null || value === '') return next();

    if (!isValidEmail(value)) {
      return next(new ApiError(400, 'Validation failed', [{ field, message: 'Please provide a valid email address' }]));
    }

    data[field] = normalizeEmail(value);
    return next();
  };
}

function validatePasswordField(field = 'password', minLength = 6, source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const value = data[field];

    if (value === undefined || value === null || value === '') return next();

    if (!isValidPassword(value, minLength)) {
      return next(
        new ApiError(400, 'Validation failed', [
          { field, message: `Password must be at least ${minLength} characters` },
        ])
      );
    }

    return next();
  };
}

function validateObjectIdParam(paramName = 'id') {
  return (req, res, next) => {
    const value = req.params?.[paramName];
    if (!isValidObjectId(value)) {
      return next(new ApiError(400, `Invalid ${paramName}`));
    }
    return next();
  };
}

function validateRatingField(field = 'rating', source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const value = data[field];
    if (value === undefined || value === null || value === '') return next();

    if (!isValidRating(value)) {
      return next(new ApiError(400, 'Validation failed', [{ field, message: 'Rating must be an integer between 1 and 5' }]));
    }

    data[field] = Number(value);
    return next();
  };
}

function validateNumericFields(fields = [], source = 'body', { allowNegative = false } = {}) {
  return (req, res, next) => {
    const data = req[source] || {};
    const errors = [];

    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(data, field)) continue;
      const value = data[field];
      if (value === '' || value === null || value === undefined) continue;

      const num = Number(value);
      const valid = Number.isFinite(num) && (allowNegative ? true : num >= 0);
      if (!valid) {
        collectError(errors, field, allowNegative ? `${field} must be a valid number` : `${field} must be a non-negative number`);
      } else {
        data[field] = num;
      }
    }

    if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
    return next();
  };
}

function validateUrlField(field = 'url', source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const value = data[field];
    if (value === undefined || value === null || value === '') return next();

    if (!isValidUrl(value)) {
      return next(new ApiError(400, 'Validation failed', [{ field, message: 'Please provide a valid URL' }]));
    }

    data[field] = trimString(value);
    return next();
  };
}

function sanitizeBodyStrings(fields = []) {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') return next();
    for (const field of fields) {
      if (typeof req.body[field] === 'string') {
        req.body[field] = req.body[field].trim();
      }
    }
    return next();
  };
}

module.exports = {
  validateRequiredFields,
  validateEmailField,
  validatePasswordField,
  validateObjectIdParam,
  validateRatingField,
  validateNumericFields,
  validateUrlField,
  sanitizeBodyStrings,
  isNonNegativeNumber,
};
