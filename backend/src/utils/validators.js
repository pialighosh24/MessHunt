const mongoose = require('mongoose');
const ApiError = require('./ApiError');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim().toLowerCase());
}

function isValidPassword(value, minLength = 6) {
  return typeof value === 'string' && value.length >= minLength;
}

function isValidUrl(value) {
  return typeof value === 'string' && URL_REGEX.test(value.trim());
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);
}

function assertValidObjectId(value, fieldName = 'id') {
  if (!isValidObjectId(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
}

function isValidRating(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 5;
}

function isNonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') return false;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0;
}

function sanitizeStringFields(obj, fields = []) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(out, field) && typeof out[field] === 'string') {
      out[field] = out[field].trim();
    }
  }
  return out;
}

module.exports = {
  EMAIL_REGEX,
  URL_REGEX,
  isNonEmptyString,
  trimString,
  normalizeEmail,
  isValidEmail,
  isValidPassword,
  isValidUrl,
  isValidObjectId,
  assertValidObjectId,
  isValidRating,
  isNonNegativeNumber,
  sanitizeStringFields,
};
