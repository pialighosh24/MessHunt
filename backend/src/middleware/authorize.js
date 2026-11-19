const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');

/**
 * Role-based authorization middleware.
 * Usage: authorize('owner'), authorize('admin'), authorize('student', 'owner')
 * Must be used after authenticate middleware.
 */
function authorize(...allowedRoles) {
  const normalized = allowedRoles.flat().filter(Boolean);

  return (req, res, next) => {
    if (!req.auth || !req.auth.role) {
      return next(new ApiError(401, 'Authentication required'));
    }

    if (normalized.length > 0 && !normalized.includes(req.auth.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }

    return next();
  };
}

const requireStudent = authorize(ROLES.STUDENT);
const requireOwner = authorize(ROLES.OWNER);
const requireAdmin = authorize(ROLES.ADMIN);

module.exports = {
  authorize,
  requireStudent,
  requireOwner,
  requireAdmin,
  ROLES,
};
