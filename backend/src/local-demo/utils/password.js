const bcrypt = require('bcryptjs');

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(String(plainPassword), salt);
}

async function comparePassword(plainPassword, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(plainPassword), String(hash));
}

module.exports = { hashPassword, comparePassword };
