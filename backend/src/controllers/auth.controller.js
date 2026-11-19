const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { ROLES } = require('../utils/constants');
const { Student, Owner, Admin } = require('../models');
const {
  issueAuthToken,
  getSafeAuthUser,
  assertRegistrationPolicy,
  assertEmailNotUsedGlobally,
} = require('../utils/auth');
const {
  isNonEmptyString,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  trimString,
} = require('../utils/validators');

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
  // phone is optional for students; if provided, basic length check
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
  if (!isNonEmptyString(phone)) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else if (phone.length < 7 || phone.length > 20) {
    errors.push({ field: 'phone', message: 'Phone number must be between 7 and 20 characters' });
  }
  if (!isValidPassword(password, 6)) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
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

function pickRegistrationDataForModel(role, input) {
  // Prevent clients from setting privileged fields (role, isActive, verification, demo flags, etc.)
  if (role === ROLES.STUDENT) {
    return {
      name: input.name,
      email: input.email,
      password: input.password,
      phone: input.phone || '',
    };
  }
  if (role === ROLES.OWNER) {
    return {
      name: input.name,
      email: input.email,
      phone: input.phone,
      password: input.password,
    };
  }
  throw new ApiError(400, 'Invalid registration role');
}

async function registerAccount({ role, Model, input }) {
  assertRegistrationPolicy(role);

  // Global uniqueness across Student/Owner/Admin collections
  await assertEmailNotUsedGlobally(input.email, { Student, Owner, Admin });

  const data = pickRegistrationDataForModel(role, input);
  const account = await Model.create(data);

  const token = issueAuthToken(account, role);
  const safeUser = getSafeAuthUser(account, role);

  return { token, user: safeUser };
}

async function loginAccount({ role, Model, email, password }) {
  // Load password explicitly for comparison; never expose it in responses/logs.
  const account = await Model.findOne({ email }).select('+password');

  // Do not reveal whether email exists: use same message for missing account or wrong password.
  if (!account) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  const isPasswordValid = await account.comparePassword(password);
  if (!isPasswordValid) {
    throw new ApiError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  // Credentials are correct at this point; block inactive accounts.
  if (account.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Please contact support/admin.');
  }

  const token = issueAuthToken(account, role);
  const safeUser = getSafeAuthUser(account, role);

  return { token, user: safeUser };
}

const registerStudent = asyncHandler(async (req, res) => {
  const input = validateStudentRegistrationInput(req.body);
  const result = await registerAccount({ role: ROLES.STUDENT, Model: Student, input });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Student registered successfully',
    data: result,
  });
});

const loginStudent = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body);
  const result = await loginAccount({ role: ROLES.STUDENT, Model: Student, email, password });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Student logged in successfully',
    data: result,
  });
});

const registerOwner = asyncHandler(async (req, res) => {
  const input = validateOwnerRegistrationInput(req.body);
  const result = await registerAccount({ role: ROLES.OWNER, Model: Owner, input });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Owner registered successfully',
    data: result,
  });
});

const loginOwner = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body);
  const result = await loginAccount({ role: ROLES.OWNER, Model: Owner, email, password });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Owner logged in successfully',
    data: result,
  });
});

const loginAdmin = asyncHandler(async (req, res) => {
  const { email, password } = validateLoginInput(req.body);
  const result = await loginAccount({ role: ROLES.ADMIN, Model: Admin, email, password });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin logged in successfully',
    data: result,
  });
});

const getMe = asyncHandler(async (req, res) => {
  if (!req.auth || !req.auth.role || !req.auth.id) {
    throw new ApiError(401, 'Authentication required');
  }

  const { role, id } = req.auth;
  let account = null;

  if (role === ROLES.STUDENT) account = await Student.findById(id);
  else if (role === ROLES.OWNER) account = await Owner.findById(id);
  else if (role === ROLES.ADMIN) account = await Admin.findById(id);

  if (!account) {
    throw new ApiError(401, 'Account not found or no longer available');
  }

  if (account.isActive === false) {
    throw new ApiError(403, 'Account is inactive. Access denied.');
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Authenticated account loaded successfully',
    data: {
      user: getSafeAuthUser(account, role),
    },
  });
});

const logout = asyncHandler(async (req, res) => {
  // Stateless JWT authentication: no server-side token revocation/blacklist is implemented.
  // Client must discard the token (and any cached session data) to complete logout.
  return sendSuccess(res, {
    statusCode: 200,
    message:
      'Logout successful. This API uses stateless JWTs, so the token is not revoked server-side; discard the token on the client.',
    data: {
      authType: 'jwt-stateless',
      tokenRevoked: false,
    },
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
