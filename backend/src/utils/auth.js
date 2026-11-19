const ApiError = require('./ApiError');
const { generateToken } = require('./jwt');
const { ROLES } = require('./constants');
const { normalizeEmail } = require('./validators');

const AUTH_ROLE_CONFIG = Object.freeze({
  [ROLES.STUDENT]: {
    collection: 'students',
    allowPublicRegistration: true,
  },
  [ROLES.OWNER]: {
    collection: 'owners',
    allowPublicRegistration: true,
  },
  [ROLES.ADMIN]: {
    collection: 'admins',
    allowPublicRegistration: false, // Controlled, secure setup only (no public admin registration)
  },
});

/**
 * Builds a minimal JWT payload for an authenticated account.
 * Never include password or sensitive secrets.
 */
function buildAuthTokenPayload(user, role) {
  if (!user || !user._id) {
    throw new ApiError(500, 'Cannot generate token: invalid user');
  }
  if (!Object.values(ROLES).includes(role)) {
    throw new ApiError(500, 'Cannot generate token: invalid role');
  }

  return {
    sub: String(user._id),
    role,
  };
}

function issueAuthToken(user, role) {
  const payload = buildAuthTokenPayload(user, role);
  return generateToken(payload);
}

function getSafeAuthUser(user, role) {
  if (!user) return null;
  const base = {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role,
    isActive: Boolean(user.isActive),
    isDemo: Boolean(user.isDemo),
  };

  if (role === ROLES.OWNER) {
    base.phone = user.phone || '';
    base.isVerified = Boolean(user.isVerified);
  }

  if (role === ROLES.STUDENT) {
    base.phone = user.phone || '';
  }

  if (role === ROLES.ADMIN) {
    // Admin has no extra public profile fields in Phase 3 model
  }

  return base;
}

function assertLoginAllowed(user) {
  // Kept for reuse where appropriate. Login flows must not reveal whether an email exists
  // when credentials are invalid; controllers handle generic invalid-credential responses.
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Please contact support/admin.');
  }
}

function assertRegistrationPolicy(role) {
  const config = AUTH_ROLE_CONFIG[role];
  if (!config) {
    throw new ApiError(400, 'Invalid account role');
  }
  if (!config.allowPublicRegistration) {
    throw new ApiError(403, 'Public registration is not allowed for this role');
  }
}

async function findEmailInAnyCollection(email, models) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { Student, Owner, Admin } = models;
  const [student, owner, admin] = await Promise.all([
    Student.findOne({ email: normalized }).select('_id email').lean(),
    Owner.findOne({ email: normalized }).select('_id email').lean(),
    Admin.findOne({ email: normalized }).select('_id email').lean(),
  ]);

  if (student) return { role: ROLES.STUDENT, id: String(student._id) };
  if (owner) return { role: ROLES.OWNER, id: String(owner._id) };
  if (admin) return { role: ROLES.ADMIN, id: String(admin._id) };
  return null;
}

async function assertEmailNotUsedGlobally(email, models) {
  const existing = await findEmailInAnyCollection(email, models);
  if (existing) {
    throw new ApiError(409, 'Email already exists', [{ field: 'email', message: 'Email already exists' }]);
  }
}

module.exports = {
  AUTH_ROLE_CONFIG,
  buildAuthTokenPayload,
  issueAuthToken,
  getSafeAuthUser,
  assertLoginAllowed,
  assertRegistrationPolicy,
  findEmailInAnyCollection,
  assertEmailNotUsedGlobally,
};
