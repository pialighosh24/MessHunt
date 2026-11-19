const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const { ROLES } = require('../../utils/constants');
const { issueAuthToken } = require('../../utils/auth');
const {
  isNonEmptyString,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  trimString,
} = require('../../utils/validators');
const { withWriteLock, getCollections } = require('../store');
const { hashPassword, comparePassword } = require('../utils/password');
const {
  createBaseUser,
  findEmailInAnyCollection,
  getSafeAuthUser,
  getUserById,
  nowIso,
} = require('../utils/storeHelpers');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

function buildValidationError(message, errors) {
  return new ApiError(400, message, errors);
}

function validateStudentRegistrationInput(body = {}) {
  const errors = [];
  const name = trimString(body.name);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const phone = body.phone !== undefined && body.phone !== null ? trimString(body.phone) : '';

  if (!isNonEmptyString(name)) errors.push({ field: 'name', message: 'Name is required' });
  if (!isValidEmail(email)) errors.push({ field: 'email', message: 'Please provide a valid email address' });
  if (!isValidPassword(password, 6)) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
  }
  if (phone && (phone.length < 7 || phone.length > 20)) {
    errors.push({ field: 'phone', message: 'Phone number must be between 7 and 20 characters' });
  }

  if (errors.length) throw buildValidationError('Validation failed', errors);
  return { name, email, password, phone };
}

function validateOwnerRegistrationInput(body = {}) {
  const errors = [];
  const name = trimString(body.name);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const phone = trimString(body.phone);

  if (!isNonEmptyString(name)) errors.push({ field: 'name', message: 'Name is required' });
  if (!isValidEmail(email)) errors.push({ field: 'email', message: 'Please provide a valid email address' });
  if (!isValidPassword(password, 6)) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
  }
  if (!isNonEmptyString(phone)) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else if (phone.length < 7 || phone.length > 20) {
    errors.push({ field: 'phone', message: 'Phone number must be between 7 and 20 characters' });
  }

  if (errors.length) throw buildValidationError('Validation failed', errors);
  return { name, email, password, phone };
}

function validateLoginInput(body = {}) {
  const errors = [];
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!isValidEmail(email)) errors.push({ field: 'email', message: 'Please provide a valid email address' });
  if (typeof password !== 'string' || password.length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  if (errors.length) throw buildValidationError('Validation failed', errors);
  return { email, password };
}

function findUserByEmailInRole(role, email) {
  const collections = getCollections();
  const normalized = normalizeEmail(email);
  if (role === ROLES.STUDENT) return collections.students.find((u) => normalizeEmail(u.email) === normalized) || null;
  if (role === ROLES.OWNER) return collections.owners.find((u) => normalizeEmail(u.email) === normalized) || null;
  if (role === ROLES.ADMIN) return collections.admins.find((u) => normalizeEmail(u.email) === normalized) || null;
  return null;
}

const registerStudent = asyncHandler(async (req, res) => {
  const input = validateStudentRegistrationInput(req.body || {});
  const passwordHash = await hashPassword(input.password);

  const result = await withWriteLock(async (state) => {
    const normalized = normalizeEmail(input.email);
    const exists = [state.students, state.owners, state.admins].some((col) =>
      col.some((u) => normalizeEmail(u.email) === normalized)
    );
    if (exists) {
      throw new ApiError(409, 'Email already exists', [{ field: 'email', message: 'Email already exists' }]);
    }
    const student = createBaseUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: ROLES.STUDENT,
      passwordHash,
      isActive: true,
      isDemo: false,
      extra: { favourites: [] },
    });
    state.students.push(student);
    return { id: student._id };
  });

  // Reload safe view from current state
  const student = getCollections().students.find((s) => String(s._id) === String(result.id));
  const token = issueAuthToken(student, ROLES.STUDENT);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Student registered successfully',
    data: {
      token,
      user: getSafeAuthUser(student, ROLES.STUDENT),
    },
  });
});

const loginStudent = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body || {});
  const student = findUserByEmailInRole(ROLES.STUDENT, email);
  if (!student) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  const isMatch = await comparePassword(password, student.passwordHash);
  if (!isMatch) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  if (student.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Please contact support/admin.');
  }

  const token = issueAuthToken(student, ROLES.STUDENT);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful',
    data: {
      token,
      user: getSafeAuthUser(student, ROLES.STUDENT),
    },
  });
});

const registerOwner = asyncHandler(async (req, res) => {
  const input = validateOwnerRegistrationInput(req.body || {});
  const passwordHash = await hashPassword(input.password);

  const result = await withWriteLock(async (state) => {
    const normalized = normalizeEmail(input.email);
    const exists = [state.students, state.owners, state.admins].some((col) =>
      col.some((u) => normalizeEmail(u.email) === normalized)
    );
    if (exists) {
      throw new ApiError(409, 'Email already exists', [{ field: 'email', message: 'Email already exists' }]);
    }
    const owner = createBaseUser({
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: ROLES.OWNER,
      passwordHash,
      isActive: true,
      isDemo: false,
      extra: { isVerified: false },
    });
    state.owners.push(owner);
    return { id: owner._id };
  });

  const owner = getCollections().owners.find((o) => String(o._id) === String(result.id));
  const token = issueAuthToken(owner, ROLES.OWNER);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Owner registered successfully',
    data: {
      token,
      user: getSafeAuthUser(owner, ROLES.OWNER),
    },
  });
});

const loginOwner = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body || {});
  const owner = findUserByEmailInRole(ROLES.OWNER, email);
  if (!owner) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  const isMatch = await comparePassword(password, owner.passwordHash);
  if (!isMatch) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  if (owner.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Please contact support/admin.');
  }

  const token = issueAuthToken(owner, ROLES.OWNER);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful',
    data: {
      token,
      user: getSafeAuthUser(owner, ROLES.OWNER),
    },
  });
});

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body || {});
  const admin = findUserByEmailInRole(ROLES.ADMIN, email);
  if (!admin) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  const isMatch = await comparePassword(password, admin.passwordHash);
  if (!isMatch) throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);

  if (admin.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Please contact support/admin.');
  }

  const token = issueAuthToken(admin, ROLES.ADMIN);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Login successful',
    data: {
      token,
      user: getSafeAuthUser(admin, ROLES.ADMIN),
    },
  });
});

const getMe = asyncHandler(async (req, res) => {
  const { id, role } = req.auth || {};
  if (!id || !role) {
    throw new ApiError(401, 'Authentication required');
  }

  const user = getUserById(role, id);
  if (!user) {
    throw new ApiError(401, 'Account not found or no longer available');
  }
  if (user.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Access denied.');
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Authenticated user retrieved successfully',
    data: {
      user: getSafeAuthUser(user, role),
    },
  });
});

const logout = asyncHandler(async (req, res) => {
  // Stateless JWT logout: client discards token. Backend confirms authenticated request.
  // (Token invalidation/blacklist can be added later if required.)
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Logout successful',
    data: null,
  });
});

module.exports = {
  registerStudent,
  loginStudent,
  registerOwner,
  loginOwner,
  loginAdmin,
  getMe,
  logout,
};
