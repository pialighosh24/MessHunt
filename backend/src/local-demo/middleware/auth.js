const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { verifyToken } = require('../../utils/jwt');
const { ROLES } = require('../../utils/constants');
const { getCollections } = require('../store');
const { sameId } = require('../ids');

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

function getCollectionByRole(role) {
  const c = getCollections();
  if (role === ROLES.STUDENT) return c.students;
  if (role === ROLES.OWNER) return c.owners;
  if (role === ROLES.ADMIN) return c.admins;
  return null;
}

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

  const collection = getCollectionByRole(role);
  if (!collection) {
    throw new ApiError(401, 'Invalid authentication token role');
  }

  const account = collection.find((u) => sameId(u._id, userId));
  if (!account) {
    throw new ApiError(401, 'Account not found or no longer available');
  }

  if (account.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Access denied.');
  }

  req.auth = {
    token,
    payload: decoded,
    id: String(account._id),
    role,
  };
  req.user = account;
  return next();
});

module.exports = { authenticate, extractBearerToken };
