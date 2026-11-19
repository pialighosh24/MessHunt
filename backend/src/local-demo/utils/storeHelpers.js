const { getCollections } = require('../store');
const { newId, sameId } = require('../ids');
const { ROLES } = require('../../utils/constants');
const { normalizeEmail } = require('../../utils/validators');

function nowIso() {
  return new Date().toISOString();
}

function roleToCollection(role) {
  if (role === ROLES.STUDENT) return 'students';
  if (role === ROLES.OWNER) return 'owners';
  if (role === ROLES.ADMIN) return 'admins';
  return null;
}

function getUserById(role, id) {
  const key = roleToCollection(role);
  if (!key) return null;
  const col = getCollections()[key];
  return col.find((u) => sameId(u._id, id)) || null;
}

function findEmailInAnyCollection(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { students, owners, admins } = getCollections();
  const s = students.find((u) => normalizeEmail(u.email) === normalized);
  if (s) return { role: ROLES.STUDENT, user: s };
  const o = owners.find((u) => normalizeEmail(u.email) === normalized);
  if (o) return { role: ROLES.OWNER, user: o };
  const a = admins.find((u) => normalizeEmail(u.email) === normalized);
  if (a) return { role: ROLES.ADMIN, user: a };
  return null;
}

function emailExistsGlobally(email) {
  return Boolean(findEmailInAnyCollection(email));
}

function createBaseUser({ name, email, phone = '', role, passwordHash, isActive = true, isDemo = false, extra = {} }) {
  const ts = nowIso();
  return {
    _id: newId(),
    name,
    email: normalizeEmail(email),
    phone: phone || '',
    passwordHash,
    role,
    isActive: Boolean(isActive),
    isDemo: Boolean(isDemo),
    createdAt: ts,
    updatedAt: ts,
    ...extra,
  };
}

function safeStudent(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: ROLES.STUDENT,
    isActive: Boolean(user.isActive),
    isDemo: Boolean(user.isDemo),
    favouritesCount: Array.isArray(user.favourites) ? user.favourites.length : 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function safeOwner(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: ROLES.OWNER,
    isActive: Boolean(user.isActive),
    isVerified: Boolean(user.isVerified),
    isDemo: Boolean(user.isDemo),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function safeAdmin(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: ROLES.ADMIN,
    isActive: Boolean(user.isActive),
    isDemo: Boolean(user.isDemo),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function getSafeAuthUser(user, role) {
  if (!user) return null;
  if (role === ROLES.STUDENT) return safeStudent(user);
  if (role === ROLES.OWNER) return safeOwner(user);
  if (role === ROLES.ADMIN) return safeAdmin(user);
  return null;
}

module.exports = {
  nowIso,
  roleToCollection,
  getUserById,
  findEmailInAnyCollection,
  emailExistsGlobally,
  createBaseUser,
  safeStudent,
  safeOwner,
  safeAdmin,
  getSafeAuthUser,
};
