const mongoose = require('mongoose');

function newId() {
  return new mongoose.Types.ObjectId().toString();
}

function isValidId(value) {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === String(value);
}

function toIdString(value) {
  if (value === undefined || value === null) return value;
  return String(value);
}

function sameId(a, b) {
  if (a === undefined || a === null || b === undefined || b === null) return false;
  return String(a) === String(b);
}

module.exports = {
  newId,
  isValidId,
  toIdString,
  sameId,
};
