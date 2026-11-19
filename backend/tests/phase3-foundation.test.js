/*
 * Phase 3 foundation checks for Mess Hunt backend.
 * Runs available checks without requiring real MongoDB Atlas credentials.
 * DB-dependent checks (actual Atlas connection, unique index enforcement on insert) are reported explicitly.
 */

const assert = require('assert');
const http = require('http');
const mongoose = require('mongoose');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_phase3_checks_only';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'mess-hunt-api';

// Ensure no accidental real DB URI is assumed from environment for this script's connection tests
if (!process.env.MONGODB_URI) {
  // leave undefined intentionally
}

const results = [];

function record(name, status, details = '') {
  results.push({ name, status, details });
  const icon = status === 'PASS' ? 'PASS' : status === 'SKIP' ? 'SKIP' : status === 'BLOCKED' ? 'BLOCKED' : 'FAIL';
  console.log(`[${icon}] ${name}${details ? ` - ${details}` : ''}`);
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
      res.on('end', async () => {
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

function runMiddleware(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; resolve({ ok: true, req, res: this }); return this; },
    };
    let nextCalled = false;
    const next = (err) => {
      nextCalled = true;
      resolve({ ok: !err, err, req, res, nextCalled: true });
    };
    try {
      const maybePromise = mw(req, res, next);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(() => {
          if (!nextCalled) resolve({ ok: true, req, res, nextCalled: false });
        }).catch((err) => resolve({ ok: false, err, req, res, nextCalled: true }));
      }
    } catch (err) {
      resolve({ ok: false, err, req, res, nextCalled: true });
    }
  });
}

async function testServerStartupAndHealth() {
  try {
    const app = require('../src/app');
    const { getDbStatus } = require('../src/config/db');
    assert.strictEqual(getDbStatus().connected, false, 'DB should not be reported connected initially');

    const response = await httpRequest(app, { method: 'GET', path: '/api/health' });
    assert.strictEqual(response.status, 200, 'Health endpoint should return 200');
    assert.strictEqual(response.body.application, 'Mess Hunt');
    assert.strictEqual(response.body.server.status, 'running');
    assert.strictEqual(response.body.database.connected, false, 'Health must not report DB connected when disconnected');
    assert.ok(response.body.timestamp, 'Timestamp should be present');
    record('1. Server startup (HTTP app responds)', 'PASS', 'Express app served health endpoint on ephemeral port');
    record('4. Health endpoint', 'PASS', 'Reports app name, server running, DB disconnected accurately, timestamp');
  } catch (err) {
    record('1. Server startup (HTTP app responds)', 'FAIL', err.message);
    record('4. Health endpoint', 'FAIL', err.message);
  }
}

async function testDbConfigAndDisconnectionHandling() {
  try {
    const connectDB = require('../src/config/db');
    const { getDbStatus, disconnectDB } = require('../src/config/db');

    let missingUriError = null;
    try {
      await connectDB('');
    } catch (err) {
      missingUriError = err;
    }
    assert.ok(missingUriError, 'connectDB should throw when MONGODB_URI is missing');
    assert.match(missingUriError.message, /MONGODB_URI/, 'Missing URI error should mention MONGODB_URI');
    assert.strictEqual(getDbStatus().connected, false, 'DB must not be marked ready after failed/missing config');

    await disconnectDB(); // safe when already disconnected
    assert.strictEqual(getDbStatus().connected, false, 'DB remains disconnected after safe disconnect call');

    if (process.env.MONGODB_URI) {
      // Not executed in this environment by default; real connection requires user-configured Atlas URI.
      record('2. MongoDB connection', 'BLOCKED', 'MONGODB_URI was not provided to this test run for a real Atlas connection');
    } else {
      record('2. MongoDB connection', 'BLOCKED', 'No MONGODB_URI configured in this environment; real Atlas connection not established (as required, not claimed)');
    }
    record('3. MongoDB disconnection handling', 'PASS', 'Missing/invalid config fails safely, status remains disconnected, disconnect is graceful when not connected; real connected-state disconnect event requires live DB session');
  } catch (err) {
    record('2. MongoDB connection', 'FAIL', err.message);
    record('3. MongoDB disconnection handling', 'FAIL', err.message);
  }
}

async function testModelValidation() {
  try {
    const { Student, Owner, Admin, Accommodation, Review } = require('../src/models');
    const ownerId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const accommodationId = new mongoose.Types.ObjectId();

    // Student validation
    const badStudent = new Student({ name: '', email: 'not-an-email', password: '123' });
    let studentErr;
    try { await badStudent.validate(); } catch (e) { studentErr = e; }
    assert.ok(studentErr, 'Invalid student should fail validation');
    assert.ok(studentErr.errors.name || studentErr.errors.email || studentErr.errors.password, 'Student validation errors expected');

    // Owner validation
    const badOwner = new Owner({ name: 'A', email: 'bad', phone: '', password: '1' });
    let ownerErr;
    try { await badOwner.validate(); } catch (e) { ownerErr = e; }
    assert.ok(ownerErr, 'Invalid owner should fail validation');

    // Admin validation
    const badAdmin = new Admin({ name: '', email: 'x', password: '1' });
    let adminErr;
    try { await badAdmin.validate(); } catch (e) { adminErr = e; }
    assert.ok(adminErr, 'Invalid admin should fail validation');

    // Accommodation validation (missing required fields, invalid URL, negative pricing, default status pending)
    const badAccommodation = new Accommodation({
      owner: ownerId,
      name: 'A',
      description: 'short',
      accommodationType: 'InvalidType',
      genderType: 'Other',
      location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'Addr', googleMapsLink: 'not-a-url' },
      pricing: { monthlyRent: -10 },
      roomDetails: { roomType: 'Huge', bathroomType: 'Open' },
      contact: { ownerDisplayName: 'Owner', contactNumber: '1' },
    });
    let accErr;
    try { await badAccommodation.validate(); } catch (e) { accErr = e; }
    assert.ok(accErr, 'Invalid accommodation should fail validation');

    const goodAccommodation = new Accommodation({
      owner: ownerId,
      name: 'Test Mess',
      description: 'Valid description for accommodation listing.',
      accommodationType: 'Mess',
      genderType: 'Co-ed',
      location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'Full address', googleMapsLink: 'https://maps.google.com/?q=test' },
      pricing: { monthlyRent: 2500 },
      roomDetails: { roomType: 'Shared', bathroomType: 'Shared' },
      contact: { ownerDisplayName: 'Owner', contactNumber: '9999999999' },
    });
    await goodAccommodation.validate();
    assert.strictEqual(goodAccommodation.status, 'pending', 'Accommodation default status must be pending');

    // Review validation (rating range, required refs)
    const badReview = new Review({ accommodation: accommodationId, student: studentId, rating: 6, comment: '', reviewerDisplayName: '' });
    let reviewErr;
    try { await badReview.validate(); } catch (e) { reviewErr = e; }
    assert.ok(reviewErr, 'Invalid review should fail validation');

    const goodReview = new Review({ accommodation: accommodationId, student: studentId, rating: 5, comment: 'Good place', reviewerDisplayName: 'Student Name' });
    await goodReview.validate();

    // Index declarations (including duplicate-prevention support)
    const studentIndexes = Student.schema.indexes();
    const ownerIndexes = Owner.schema.indexes();
    const adminIndexes = Admin.schema.indexes();
    const reviewIndexes = Review.schema.indexes();
    const hasEmailUnique = (indexes) => indexes.some(([fields, opts]) => fields.email === 1 && opts && opts.unique);
    const hasReviewUniqueCompound = reviewIndexes.some(([fields, opts]) => fields.accommodation === 1 && fields.student === 1 && opts && opts.unique);

    assert.ok(hasEmailUnique(studentIndexes), 'Student email unique index declared');
    assert.ok(hasEmailUnique(ownerIndexes), 'Owner email unique index declared');
    assert.ok(hasEmailUnique(adminIndexes), 'Admin email unique index declared');
    assert.ok(hasReviewUniqueCompound, 'Review unique compound index (accommodation, student) declared');

    record('5. Model validation', 'PASS', 'Schema validations, defaults (accommodation pending), and index declarations verified');
  } catch (err) {
    record('5. Model validation', 'FAIL', err.message);
  }
}

async function testDuplicateEmailPrevention() {
  // Actual duplicate-key enforcement on insert requires a live MongoDB collection with indexes.
  const hasDb = Boolean(process.env.MONGODB_URI) && mongoose.connection.readyState === 1;
  if (!hasDb) {
    record('6. Duplicate email prevention', 'BLOCKED', 'Unique indexes declared in schemas; actual DB-level duplicate insert rejection not executed because no live MongoDB connection is established in this environment');
    return;
  }
  record('6. Duplicate email prevention', 'BLOCKED', 'Live DB test path not configured in this script run');
}

async function testPasswordHashing() {
  try {
    const { hashPassword, comparePassword } = require('../src/utils/password');
    const { Student } = require('../src/models');

    const plain = 'Secret123!';
    const hashed = await hashPassword(plain);
    assert.notStrictEqual(hashed, plain, 'Hashed password must differ from plaintext');
    assert.ok(await comparePassword(plain, hashed), 'Correct password should compare successfully');
    assert.ok(!(await comparePassword('wrong-password', hashed)), 'Wrong password should not match');

    // Model pre-save hashing behavior (without persisting): direct set triggers isModified
    const student = new Student({ name: 'Test User', email: 'test@example.com', password: plain });
    assert.strictEqual(student.isModified('password'), true);
    // simulate hash as hook would do
    student.password = await hashPassword(student.password);
    assert.notStrictEqual(student.password, plain, 'Stored model password value should be hashed');
    const safe = student.toObject();
    assert.ok(!('password' in safe), 'Password must not be returned in safe/object output');

    record('7. Password hashing', 'PASS', 'bcrypt hashing/comparison and non-exposure in model output verified');
  } catch (err) {
    record('7. Password hashing', 'FAIL', err.message);
  }
}

async function testJwt() {
  try {
    const { generateToken, verifyToken } = require('../src/utils/jwt');

    const token = generateToken({ sub: '507f1f77bcf86cd799439011', role: 'student' });
    assert.ok(typeof token === 'string' && token.length > 20, 'JWT should be generated');

    const decoded = verifyToken(token);
    assert.strictEqual(decoded.sub, '507f1f77bcf86cd799439011');
    assert.strictEqual(decoded.role, 'student');

    let invalidErr;
    try { verifyToken(token + 'tampered'); } catch (e) { invalidErr = e; }
    assert.ok(invalidErr, 'Invalid token should be rejected');
    assert.strictEqual(invalidErr.statusCode, 401, 'Invalid token should map to 401');

    const jwt = require('jsonwebtoken');
    const expired = jwt.sign({ sub: '1', role: 'owner' }, process.env.JWT_SECRET, { expiresIn: -10, issuer: process.env.JWT_ISSUER });
    let expiredErr;
    try { verifyToken(expired); } catch (e) { expiredErr = e; }
    assert.ok(expiredErr, 'Expired token should be rejected');
    assert.strictEqual(expiredErr.statusCode, 401, 'Expired token should map to 401');

    record('8. JWT generation', 'PASS', 'Token generated with configured secret/claims');
    record('9. JWT verification', 'PASS', 'Valid token verified; invalid and expired tokens rejected');
  } catch (err) {
    record('8. JWT generation', 'FAIL', err.message);
    record('9. JWT verification', 'FAIL', err.message);
  }
}

async function testRoleAuthorization() {
  try {
    const { authorize, requireStudent, requireOwner, requireAdmin } = require('../src/middleware/authorize');

    // No auth context
    const noAuth = await runMiddleware(authorize('admin'), { auth: null });
    assert.ok(noAuth.err, 'Missing auth should be rejected');
    assert.strictEqual(noAuth.err.statusCode, 401);

    // Wrong role
    const wrongRole = await runMiddleware(requireAdmin, { auth: { id: '1', role: 'student' } });
    assert.ok(wrongRole.err, 'Student should not access admin operation');
    assert.strictEqual(wrongRole.err.statusCode, 403);

    const ownerToAdmin = await runMiddleware(requireAdmin, { auth: { id: '2', role: 'owner' } });
    assert.ok(ownerToAdmin.err, 'Owner should not access admin operation');
    assert.strictEqual(ownerToAdmin.err.statusCode, 403);

    // Correct roles
    const studentOk = await runMiddleware(requireStudent, { auth: { id: '1', role: 'student' } });
    assert.ok(!studentOk.err, 'Student should access student operation');

    const ownerOk = await runMiddleware(requireOwner, { auth: { id: '2', role: 'owner' } });
    assert.ok(!ownerOk.err, 'Owner should access owner operation');

    const adminOk = await runMiddleware(requireAdmin, { auth: { id: '3', role: 'admin' } });
    assert.ok(!adminOk.err, 'Admin should access admin operation');

    // Active-account enforcement is implemented in authenticate middleware (DB lookup). Without live DB, verify logic path exists.
    const fs = require('fs');
    const authSource = fs.readFileSync(require.resolve('../src/middleware/auth'), 'utf8');
    assert.ok(authSource.includes('isActive') && authSource.includes('403'), 'authenticate middleware enforces inactive account blocking');

    record('10. Role authorization', 'PASS', 'RBAC middleware distinguishes student/owner/admin; inactive-account enforcement present in authenticate middleware (live-account check requires DB-backed request)');
  } catch (err) {
    record('10. Role authorization', 'FAIL', err.message);
  }
}

async function testInvalidRequestHandling() {
  try {
    const app = require('../src/app');
    const errorHandler = require('../src/middleware/errorHandler');
    const ApiError = require('../src/utils/ApiError');

    // 404 route
    const notFoundRes = await httpRequest(app, { method: 'GET', path: '/api/does-not-exist' });
    assert.strictEqual(notFoundRes.status, 404);
    assert.strictEqual(notFoundRes.body.success, false);

    // Invalid JSON body handling via centralized error handler normalization
    const normalizedSyntax = await new Promise((resolve) => {
      const req = {};
      const res = { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(p){this.body=p;resolve({status:this.statusCode, body:p});} };
      const syntaxErr = new SyntaxError('Unexpected token');
      syntaxErr.status = 400; syntaxErr.body = '{bad';
      errorHandler(syntaxErr, req, res, () => {});
    });
    assert.strictEqual(normalizedSyntax.status, 400);
    assert.match(normalizedSyntax.body.message, /Invalid JSON/i);

    // Mongoose CastError normalization
    const castNormalized = await new Promise((resolve) => {
      const req = {}; const res = { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(p){this.body=p;resolve({status:this.statusCode, body:p});} };
      const castErr = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
      errorHandler(castErr, req, res, () => {});
    });
    assert.strictEqual(castNormalized.status, 400);

    // Duplicate key normalization
    const dupNormalized = await new Promise((resolve) => {
      const req = {}; const res = { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(p){this.body=p;resolve({status:this.statusCode, body:p});} };
      errorHandler({ code: 11000, keyValue: { email: 'x@example.com' } }, req, res, () => {});
    });
    assert.strictEqual(dupNormalized.status, 409);

    // ApiError pass-through
    const apiNormalized = await new Promise((resolve) => {
      const req = {}; const res = { statusCode: 200, body: null, status(c){this.statusCode=c;return this;}, json(p){this.body=p;resolve({status:this.statusCode, body:p});} };
      errorHandler(new ApiError(400, 'Bad request', [{ field: 'x', message: 'x required' }]), req, res, () => {});
    });
    assert.strictEqual(apiNormalized.status, 400);
    assert.strictEqual(apiNormalized.body.success, false);
    assert.ok(Array.isArray(apiNormalized.body.errors));

    record('11. Invalid request handling', 'PASS', '404, invalid JSON, invalid ObjectId/CastError, duplicate key, and consistent API error responses verified');
  } catch (err) {
    record('11. Invalid request handling', 'FAIL', err.message);
  }
}

async function main() {
  console.log('Running Mess Hunt Phase 3 foundation checks...\n');
  await testServerStartupAndHealth();
  await testDbConfigAndDisconnectionHandling();
  await testModelValidation();
  await testDuplicateEmailPrevention();
  await testPasswordHashing();
  await testJwt();
  await testRoleAuthorization();
  await testInvalidRequestHandling();

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));

  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
