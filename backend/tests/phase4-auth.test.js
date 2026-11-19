/*
 * Phase 4 - Step 3: Authentication API checks (Mess Hunt)
 *
 * Notes:
 * - Runs endpoint/logic checks using the Express app and controlled model stubs.
 * - No live MongoDB connection is configured in this environment, so actual DB persistence,
 *   pre-save hook execution in MongoDB, and DB-enforced unique index behavior are BLOCKED here.
 * - Global email uniqueness across Student/Owner/Admin collections is implemented in application logic
 *   and is verified via stubs in this run.
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_auth_checks_only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_ISSUER = 'mess-hunt-api';

const results = [];
function record(name, status, details = '') {
  results.push({ name, status, details });
  console.log(`[${status}] ${name}${details ? ` - ${details}` : ''}`);
}

async function httpRequest(app, { method = 'GET', path = '/', body, headers = {} } = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const payload = body ? JSON.stringify(body) : null;
  const reqHeaders = { ...headers };
  if (payload) {
    reqHeaders['Content-Type'] = 'application/json';
    reqHeaders['Content-Length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: reqHeaders }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        server.close(() => {
          let parsed = data;
          try { parsed = data ? JSON.parse(data) : null; } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        });
      });
    });
    req.on('error', (err) => server.close(() => reject(err)));
    if (payload) req.write(payload);
    req.end();
  });
}

function makeDoc(data) {
  return {
    ...data,
    _id: data._id || data.id || '507f1f77bcf86cd799439011',
    comparePassword: data.comparePassword || (async (plain) => plain === data.__plainPassword),
    toObject() {
      const obj = { ...this };
      delete obj.comparePassword;
      delete obj.__plainPassword;
      return obj;
    },
    toJSON() {
      return this.toObject();
    },
  };
}

function withSelect(result) {
  // Supports: await Model.findOne(...).select('+password')
  return {
    select: () => Promise.resolve(result),
    lean: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
}

function withSelectLean(result) {
  // Supports: await Model.findOne(...).select('_id email').lean()
  const chain = {
    select: () => chain,
    lean: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function setModelStubs(models, stubs) {
  const originals = {};
  for (const [modelName, methodStubs] of Object.entries(stubs)) {
    originals[modelName] = originals[modelName] || {};
    for (const [method, impl] of Object.entries(methodStubs)) {
      originals[modelName][method] = models[modelName][method];
      models[modelName][method] = impl;
    }
  }
  return () => {
    for (const [modelName, methodStubs] of Object.entries(originals)) {
      for (const [method, impl] of Object.entries(methodStubs)) {
        models[modelName][method] = impl;
      }
    }
  };
}

async function main() {
  const app = require('../src/app');
  const models = require('../src/models');
  const { ROLES } = require('../src/utils/constants');

  console.log('Running Phase 4 Step 3 (Auth) checks...\n');

  // 1) Student registration
  try {
    const restore = setModelStubs(models, {
      Student: {
        findOne: () => withSelectLean(null),
        create: async (data) => makeDoc({ ...data, _id: '65f000000000000000000001', role: ROLES.STUDENT, isActive: true, isDemo: false }),
        findById: async () => null,
      },
      Owner: { findOne: () => withSelectLean(null), findById: async () => null },
      Admin: { findOne: () => withSelectLean(null), findById: async () => null },
    });

    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/student/register',
      body: { name: 'Test Student', email: 'Student@Example.com', password: 'secret123', phone: '9876543210' },
    });

    restore();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.data.token, 'JWT token should be returned');
    assert.strictEqual(res.body.data.user.role, 'student');
    assert.strictEqual(res.body.data.user.email, 'student@example.com');
    assert.ok(!('password' in (res.body.data.user || {})), 'Password must not be returned');
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER });
    assert.strictEqual(decoded.role, 'student');
    assert.strictEqual(decoded.sub, '65f000000000000000000001');
    record('Student registration', 'PASS', 'Registers student, normalizes email, returns JWT with student role, no password exposed');
  } catch (err) {
    record('Student registration', 'FAIL', err.message);
  }

  // 2) Owner registration
  try {
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelectLean(null), findById: async () => null },
      Owner: {
        findOne: () => withSelectLean(null),
        create: async (data) => makeDoc({ ...data, _id: '65f000000000000000000002', role: ROLES.OWNER, isActive: true, isVerified: false, isDemo: false }),
        findById: async () => null,
      },
      Admin: { findOne: () => withSelectLean(null), findById: async () => null },
    });

    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/owner/register',
      body: { name: 'Test Owner', email: 'owner@example.com', password: 'secret123', phone: '9876543210' },
    });

    restore();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.user.role, 'owner');
    assert.strictEqual(res.body.data.user.phone, '9876543210');
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER });
    assert.strictEqual(decoded.role, 'owner');
    assert.ok(!JSON.stringify(res.body).includes('password'), 'Response must not contain password fields');
    record('Owner registration', 'PASS', 'Registers owner separately, returns JWT with owner role, no password exposed');
  } catch (err) {
    record('Owner registration', 'FAIL', err.message);
  }

  // 3) Invalid registration input
  try {
    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/student/register',
      body: { name: '', email: 'bad-email', password: '123' },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    record('Invalid registration input', 'PASS', 'Rejects invalid/missing fields with validation errors');
  } catch (err) {
    record('Invalid registration input', 'FAIL', err.message);
  }

  // 4) Duplicate email across collections (global check)
  try {
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelectLean(null), create: async () => { throw new Error('should not create'); }, findById: async () => null },
      Owner: { findOne: () => withSelectLean(null), create: async () => { throw new Error('should not create'); }, findById: async () => null },
      Admin: {
        findOne: (q) => withSelectLean(q.email === 'taken@example.com' ? { _id: '65f000000000000000000099', email: 'taken@example.com' } : null),
        findById: async () => null,
      },
    });

    const res = await httpRequest(app, {
      method: 'POST',
      path: '/api/auth/student/register',
      body: { name: 'Dup Student', email: 'taken@example.com', password: 'secret123' },
    });

    restore();

    assert.strictEqual(res.status, 409);
    assert.match(res.body.message, /Email already exists/i);
    record('Duplicate email prevention (global)', 'PASS', 'Rejects registration when email exists in another collection (Admin)');
  } catch (err) {
    record('Duplicate email prevention (global)', 'FAIL', err.message);
  }

  // 5) Successful student login
  try {
    const studentDoc = makeDoc({
      _id: '65f000000000000000000011',
      name: 'Student One',
      email: 'student1@example.com',
      role: ROLES.STUDENT,
      isActive: true,
      isDemo: false,
      phone: '9999999999',
      __plainPassword: 'secret123',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(studentDoc), findById: async () => studentDoc, create: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/student/login',
      body: { email: 'student1@example.com', password: 'secret123' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.data.token);
    assert.strictEqual(res.body.data.user.role, 'student');
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER });
    assert.strictEqual(decoded.role, 'student');
    assert.ok(!JSON.stringify(res.body).includes('__plainPassword'));
    record('Successful login (student)', 'PASS', 'Valid credentials return JWT with student role claim');
  } catch (err) {
    record('Successful login (student)', 'FAIL', err.message);
  }

  // 6) Successful owner login
  try {
    const ownerDoc = makeDoc({
      _id: '65f000000000000000000012', name: 'Owner One', email: 'owner1@example.com', phone: '8888888888',
      role: ROLES.OWNER, isActive: true, isVerified: true, isDemo: false, __plainPassword: 'ownerpass',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(ownerDoc), findById: async () => ownerDoc },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/owner/login',
      body: { email: 'owner1@example.com', password: 'ownerpass' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user.role, 'owner');
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER });
    assert.strictEqual(decoded.role, 'owner');
    record('Successful login (owner)', 'PASS', 'Owner login returns JWT with owner role claim');
  } catch (err) {
    record('Successful login (owner)', 'FAIL', err.message);
  }

  // 7) Successful admin login
  try {
    const adminDoc = makeDoc({
      _id: '65f000000000000000000013', name: 'Admin One', email: 'admin1@example.com',
      role: ROLES.ADMIN, isActive: true, isDemo: false, __plainPassword: 'adminpass',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(adminDoc), findById: async () => adminDoc },
    });

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/admin/login',
      body: { email: 'admin1@example.com', password: 'adminpass' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.user.role, 'admin');
    const decoded = jwt.verify(res.body.data.token, process.env.JWT_SECRET, { issuer: process.env.JWT_ISSUER });
    assert.strictEqual(decoded.role, 'admin');
    record('Successful login (admin)', 'PASS', 'Admin login returns JWT with admin role claim');
  } catch (err) {
    record('Successful login (admin)', 'FAIL', err.message);
  }

  // 8) Incorrect password (no existence leak) - student
  try {
    const studentDoc = makeDoc({
      _id: '65f000000000000000000021', name: 'Student', email: 'exists@example.com',
      role: ROLES.STUDENT, isActive: true, isDemo: false, __plainPassword: 'correctpass',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(studentDoc), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const wrongPass = await httpRequest(app, {
      method: 'POST', path: '/api/auth/student/login',
      body: { email: 'exists@example.com', password: 'wrongpass' },
    });
    restore();

    assert.strictEqual(wrongPass.status, 401);
    assert.strictEqual(wrongPass.body.message, 'Invalid email or password');
    record('Incorrect password (student)', 'PASS', 'Returns generic invalid-credentials message (401)');
  } catch (err) {
    record('Incorrect password (student)', 'FAIL', err.message);
  }

  // 8b) Incorrect password (no existence leak) - owner
  try {
    const ownerDoc = makeDoc({
      _id: '65f000000000000000000022', name: 'Owner', email: 'owner.exists@example.com', phone: '9999999999',
      role: ROLES.OWNER, isActive: true, isVerified: false, isDemo: false, __plainPassword: 'correctpass',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(ownerDoc), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const wrongPass = await httpRequest(app, {
      method: 'POST', path: '/api/auth/owner/login',
      body: { email: 'owner.exists@example.com', password: 'wrongpass' },
    });
    restore();

    assert.strictEqual(wrongPass.status, 401);
    assert.strictEqual(wrongPass.body.message, 'Invalid email or password');
    record('Incorrect password (owner)', 'PASS', 'Owner login returns same generic invalid-credentials message (401)');
  } catch (err) {
    record('Incorrect password (owner)', 'FAIL', err.message);
  }

  // 8c) Incorrect password (no existence leak) - admin
  try {
    const adminDoc = makeDoc({
      _id: '65f000000000000000000023', name: 'Admin', email: 'admin.exists@example.com',
      role: ROLES.ADMIN, isActive: true, isDemo: false, __plainPassword: 'correctpass',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(adminDoc), findById: async () => null },
    });

    const wrongPass = await httpRequest(app, {
      method: 'POST', path: '/api/auth/admin/login',
      body: { email: 'admin.exists@example.com', password: 'wrongpass' },
    });
    restore();

    assert.strictEqual(wrongPass.status, 401);
    assert.strictEqual(wrongPass.body.message, 'Invalid email or password');
    record('Incorrect password (admin)', 'PASS', 'Admin login returns same generic invalid-credentials message (401)');
  } catch (err) {
    record('Incorrect password (admin)', 'FAIL', err.message);
  }

  // 9) Non-existent email login (same generic message) - student
  try {
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const missingEmail = await httpRequest(app, {
      method: 'POST', path: '/api/auth/student/login',
      body: { email: 'missing@example.com', password: 'whatever' },
    });
    restore();

    assert.strictEqual(missingEmail.status, 401);
    assert.strictEqual(missingEmail.body.message, 'Invalid email or password');
    record('Non-existent email login (student)', 'PASS', 'Same generic message/status as incorrect password (no existence leak)');
  } catch (err) {
    record('Non-existent email login (student)', 'FAIL', err.message);
  }

  // 9b) Non-existent email login (same generic message) - owner
  try {
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const missingEmail = await httpRequest(app, {
      method: 'POST', path: '/api/auth/owner/login',
      body: { email: 'missing.owner@example.com', password: 'whatever' },
    });
    restore();

    assert.strictEqual(missingEmail.status, 401);
    assert.strictEqual(missingEmail.body.message, 'Invalid email or password');
    record('Non-existent email login (owner)', 'PASS', 'Owner login uses same generic message/status (no existence leak)');
  } catch (err) {
    record('Non-existent email login (owner)', 'FAIL', err.message);
  }

  // 9c) Non-existent email login (same generic message) - admin
  try {
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(null), findById: async () => null },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const missingEmail = await httpRequest(app, {
      method: 'POST', path: '/api/auth/admin/login',
      body: { email: 'missing.admin@example.com', password: 'whatever' },
    });
    restore();

    assert.strictEqual(missingEmail.status, 401);
    assert.strictEqual(missingEmail.body.message, 'Invalid email or password');
    record('Non-existent email login (admin)', 'PASS', 'Admin login uses same generic message/status (no existence leak)');
  } catch (err) {
    record('Non-existent email login (admin)', 'FAIL', err.message);
  }

  // 10) Inactive account blocked (after correct credentials)
  try {
    const inactiveDoc = makeDoc({
      _id: '65f000000000000000000031', name: 'Inactive', email: 'inactive@example.com',
      role: ROLES.STUDENT, isActive: false, isDemo: false, __plainPassword: 'secret123',
    });
    const restore = setModelStubs(models, {
      Student: { findOne: () => withSelect(inactiveDoc), findById: async () => inactiveDoc },
      Owner: { findOne: () => withSelect(null), findById: async () => null },
      Admin: { findOne: () => withSelect(null), findById: async () => null },
    });

    const res = await httpRequest(app, {
      method: 'POST', path: '/api/auth/student/login',
      body: { email: 'inactive@example.com', password: 'secret123' },
    });
    restore();

    assert.strictEqual(res.status, 403);
    assert.match(res.body.message, /inactive/i);
    record('Inactive account login blocked', 'PASS', 'Correct credentials for inactive account are rejected (403)');
  } catch (err) {
    record('Inactive account login blocked', 'FAIL', err.message);
  }

  // 11) Missing token and invalid token for protected routes
  try {
    const noToken = await httpRequest(app, { method: 'GET', path: '/api/auth/me' });
    assert.strictEqual(noToken.status, 401);

    const badToken = await httpRequest(app, {
      method: 'GET', path: '/api/auth/me',
      headers: { Authorization: 'Bearer invalid.token.value' },
    });
    assert.strictEqual(badToken.status, 401);

    record('Missing/invalid token', 'PASS', 'Protected auth endpoints reject missing and invalid tokens');
  } catch (err) {
    record('Missing/invalid token', 'FAIL', err.message);
  }

  // 12) /api/auth/me and role separation + role claim matches collection
  try {
    const studentDoc = makeDoc({
      _id: '65f000000000000000000041', name: 'Me Student', email: 'me.student@example.com',
      role: ROLES.STUDENT, isActive: true, isDemo: false, phone: '1111111111',
    });
    const ownerDoc = makeDoc({
      _id: '65f000000000000000000042', name: 'Me Owner', email: 'me.owner@example.com',
      role: ROLES.OWNER, isActive: true, isVerified: false, isDemo: false, phone: '2222222222',
    });

    // Student token -> loads from Student collection
    let restore = setModelStubs(models, {
      Student: { findById: async (id) => (String(id) === studentDoc._id ? studentDoc : null), findOne: async () => null },
      Owner: { findById: async () => null, findOne: async () => null },
      Admin: { findById: async () => null, findOne: async () => null },
    });
    const studentToken = jwt.sign({ sub: studentDoc._id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: process.env.JWT_ISSUER });
    const meStudent = await httpRequest(app, { method: 'GET', path: '/api/auth/me', headers: { Authorization: `Bearer ${studentToken}` } });
    restore();
    assert.strictEqual(meStudent.status, 200);
    assert.strictEqual(meStudent.body.data.user.role, 'student');
    assert.strictEqual(meStudent.body.data.user.email, 'me.student@example.com');

    // Owner token -> loads from Owner collection
    restore = setModelStubs(models, {
      Student: { findById: async () => null, findOne: async () => null },
      Owner: { findById: async (id) => (String(id) === ownerDoc._id ? ownerDoc : null), findOne: async () => null },
      Admin: { findById: async () => null, findOne: async () => null },
    });
    const ownerToken = jwt.sign({ sub: ownerDoc._id, role: 'owner' }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: process.env.JWT_ISSUER });
    const meOwner = await httpRequest(app, { method: 'GET', path: '/api/auth/me', headers: { Authorization: `Bearer ${ownerToken}` } });
    restore();
    assert.strictEqual(meOwner.status, 200);
    assert.strictEqual(meOwner.body.data.user.role, 'owner');

    // Mismatched role claim (student token but no student record / wrong collection context) rejected
    restore = setModelStubs(models, {
      Student: { findById: async () => null, findOne: async () => null },
      Owner: { findById: async (id) => (String(id) === ownerDoc._id ? ownerDoc : null), findOne: async () => null },
      Admin: { findById: async () => null, findOne: async () => null },
    });
    const mismatched = await httpRequest(app, { method: 'GET', path: '/api/auth/me', headers: { Authorization: `Bearer ${studentToken}` } });
    restore();
    assert.strictEqual(mismatched.status, 401);

    record('GET /api/auth/me and role separation', 'PASS', 'Authenticated account loaded from correct collection; role claims match collection context; mismatched role/account rejected');
  } catch (err) {
    record('GET /api/auth/me and role separation', 'FAIL', err.message);
  }

  // 13) Logout behavior (stateless JWT, no server-side revocation claim)
  try {
    const studentDoc = makeDoc({
      _id: '65f000000000000000000051', name: 'Logout Student', email: 'logout@example.com',
      role: ROLES.STUDENT, isActive: true, isDemo: false,
    });
    const restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc, findOne: async () => null },
      Owner: { findById: async () => null, findOne: async () => null },
      Admin: { findById: async () => null, findOne: async () => null },
    });
    const token = jwt.sign({ sub: studentDoc._id, role: 'student' }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: process.env.JWT_ISSUER });
    const res = await httpRequest(app, { method: 'POST', path: '/api/auth/logout', headers: { Authorization: `Bearer ${token}` } });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.tokenRevoked, false);
    assert.match(res.body.message, /stateless/i);
    record('Logout behavior', 'PASS', 'Authenticated logout returns success and clearly states JWT is not revoked server-side');
  } catch (err) {
    record('Logout behavior', 'FAIL', err.message);
  }

  // 14) DB-dependent checks (blocked in this environment)
  record('DB persistence for registration/login', 'BLOCKED', 'No live isolated MongoDB configured; endpoint logic verified with stubs but actual persistence not executed');
  record('DB-enforced unique index (per-collection) verification', 'BLOCKED', 'No live DB; global email uniqueness enforced in application logic and tested with stubs');
  record('Password hashing at DB save (pre-save hook on insert)', 'BLOCKED', 'Model hook exists (Phase 3) but actual MongoDB insert/save not executed without live DB');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
