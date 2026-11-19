const jwt = require('jsonwebtoken');
const ApiError = require('./ApiError');

function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const issuer = process.env.JWT_ISSUER || 'mess-hunt-api';

  if (!secret) {
    throw new ApiError(500, 'JWT configuration error: JWT_SECRET is not set');
  }

  return { secret, expiresIn, issuer };
}

function generateToken(payload) {
  const { secret, expiresIn, issuer } = getJwtConfig();
  // Payload should include minimal claims (e.g. sub/id, role). Never include password/hash.
  return jwt.sign(payload, secret, { expiresIn, issuer });
}

function verifyToken(token) {
  const { secret, issuer } = getJwtConfig();
  try {
    return jwt.verify(token, secret, { issuer });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Authentication token has expired');
    }
    if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
      throw new ApiError(401, 'Invalid authentication token');
    }
    throw new ApiError(401, 'Authentication failed');
  }
}

module.exports = {
  generateToken,
  verifyToken,
  getJwtConfig,
};
