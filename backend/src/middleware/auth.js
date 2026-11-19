const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');
const { ROLES } = require('../utils/constants');

// Lazy model resolution to avoid load-order issues during scaffolding
function getModelByRole(role) {
  switch (role) {
    case ROLES.STUDENT:
      return require('../models/Student');
    case ROLES.OWNER:
      return require('../models/Owner');
    case ROLES.ADMIN:
      return require('../models/Admin');
    default:
      return null;
  }
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

/**
 * Verifies JWT and attaches authenticated identity.
 * Also loads the current account record to ensure it exists and is active.
 * Inactive accounts are blocked from protected operations.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req);
  if (!token) {
    throw new ApiError(401, 'Authentication required. Please provide a valid token.');
  }

  const decoded = verifyToken(token);
  const userId = decoded.sub || decoded.id;
  const role = decoded.role;

  if (!userId || !role) {
    throw new ApiError(401, 'Invalid authentication token payload');
  }

  const Model = getModelByRole(role);
  if (!Model) {
    throw new ApiError(401, 'Invalid authentication token role');
  }

  // Password is not selected by default in schemas; fetch account to verify existence and active status.
  const account = await Model.findById(userId);

  if (!account) {
    throw new ApiError(401, 'Account not found or no longer available');
  }

  if (account.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Access denied.');
  }

  // Attach both raw auth claims and hydrated account context (safe fields only)
  req.auth = {
    id: String(account._id),
    role,
    tokenClaims: {
      sub: String(userId),
      role,
      iat: decoded.iat,
      exp: decoded.exp,
      iss: decoded.iss,
    },
  };

  req.user = {
    id: String(account._id),
    role,
    name: account.name,
    email: account.email,
    isActive: account.isActive,
    isDemo: Boolean(account.isDemo),
    ...(role === ROLES.OWNER ? { isVerified: Boolean(account.isVerified) } : {}),
  };

  next();
});

module.exports = {
  authenticate,
  extractBearerToken,
  getModelByRole,
};
