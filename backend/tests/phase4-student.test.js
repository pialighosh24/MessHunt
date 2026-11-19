/*
 * Phase 4 - Step 4: Student API checks (Mess Hunt)
 *
 * Runs endpoint/logic checks with Express app and controlled model stubs.
 * No live isolated MongoDB is configured in this environment, so actual persistence,
 * Mongoose save hooks on DB writes, and DB-level unique/index behavior are BLOCKED.
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_student_checks_only';
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

function makeStudentDoc(data = {}) {
  const doc = {
    _id: data._id || '65f100000000000000000001',
    name: data.name || 'Student One',
    email: data.email || 'student.one@example.com',
    phone: data.phone || '9999999999',
    role: 'student',
    isActive: data.isActive !== undefined ? data.isActive : true,
    isDemo: data.isDemo || false,
    favourites: Array.isArray(data.favourites) ? [...data.favourites] : [],
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    async save() {
      this.updatedAt = new Date('2026-01-02T00:00:00.000Z');
      return this;
    },
    toObject() {
      const { save, ...rest } = this;
      return { ...rest };
    },
    toJSON() { return this.toObject(); },
  };
  // allow custom save tracking
  if (typeof data.save === 'function') doc.save = data.save.bind(doc);
  return doc;
}

function makeAccommodationDoc(data = {}) {
  return {
    _id: data._id || '65f200000000000000000001',
    owner: data.owner || '65f300000000000000000001',
    name: data.name || 'Approved Mess',
    description: data.description || 'A good and approved accommodation for students.',
    accommodationType: data.accommodationType || 'Mess',
    genderType: data.genderType || 'Co-ed',
    suitableFor: data.suitableFor || 'Students',
    location: data.location || {
      state: 'West Bengal', district: 'Paschim Medinipur', city: 'Midnapore', locality: 'Rangamati',
      fullAddress: 'Near College Road', landmark: 'Main Gate', googleMapsLink: 'https://maps.google.com/?q=midnapore',
    },
    pricing: data.pricing || { monthlyRent: 3000, securityDeposit: 1000, electricityCharges: 0, waterCharges: 0, foodCharges: 0, otherCharges: 0 },
    roomDetails: data.roomDetails || { roomType: 'Shared', availableRoomsOrBeds: 2, bathroomType: 'Shared', furnishing: 'Basic' },
    foodInfo: data.foodInfo || { foodProvided: false, selfCookingAllowed: true, homeFoodDeliveryAllowed: true },
    facilities: data.facilities || ['Wi-Fi', 'Water'],
    availability: data.availability || { status: 'Available', availableBeds: 2, availableFrom: null },
    photos: data.photos || [],
    status: data.status || 'approved',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
  };
}

function withPopulate(result) {
  return {
    populate: async () => result,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
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

function makeToken(sub, role = 'student') {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: process.env.JWT_ISSUER });
}

async function main() {
  const app = require('../src/app');
  const models = require('../src/models');

  console.log('Running Phase 4 Step 4 (Student APIs) checks...\n');

  const studentId = '65f100000000000000000001';
  const otherStudentId = '65f100000000000000000099';
  const approvedAccId = '65f200000000000000000001';
  const pendingAccId = '65f200000000000000000002';
  const rejectedAccId = '65f200000000000000000003';
  const invalidAccId = 'not-a-valid-id';

  // 1) Profile retrieval
  try {
    const studentDoc = makeStudentDoc({ _id: studentId, name: 'Student One', email: 'one@example.com' });
    const restore = setModelStubs(models, {
      Student: { findById: async (id) => (String(id) === studentId ? studentDoc : null) },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, { method: 'GET', path: '/api/students/profile', headers: { Authorization: `Bearer ${token}` } });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.profile.id, studentId);
    assert.strictEqual(res.body.data.profile.email, 'one@example.com');
    assert.ok(!JSON.stringify(res.body).includes('password'));
    record('Student profile retrieval', 'PASS', 'Authenticated student can retrieve own profile (no password exposed)');
  } catch (err) {
    record('Student profile retrieval', 'FAIL', err.message);
  }

  // 2) Student cannot access another student\'s data (profile scoped to authenticated identity)
  try {
    const studentA = makeStudentDoc({ _id: studentId, name: 'Student A', email: 'a@example.com' });
    const studentB = makeStudentDoc({ _id: otherStudentId, name: 'Student B', email: 'b@example.com' });
    const restore = setModelStubs(models, {
      Student: {
        findById: async (id) => {
          if (String(id) === studentId) return studentA;
          if (String(id) === otherStudentId) return studentB;
          return null;
        },
      },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
    });
    const tokenA = makeToken(studentId, 'student');
    const res = await httpRequest(app, { method: 'GET', path: '/api/students/profile', headers: { Authorization: `Bearer ${tokenA}` } });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.profile.id, studentId);
    assert.strictEqual(res.body.data.profile.email, 'a@example.com');
    assert.notStrictEqual(res.body.data.profile.id, otherStudentId);
    record('Student cannot access another student\'s data', 'PASS', 'Profile endpoint is scoped to authenticated student identity (no cross-student access)');
  } catch (err) {
    record('Student cannot access another student\'s data', 'FAIL', err.message);
  }

  // 3) Profile update (allowed fields only)
  try {
    let saved = false;
    const studentDoc = makeStudentDoc({ _id: studentId, name: 'Old Name', phone: '1111111111' });
    studentDoc.save = async function () { saved = true; this.updatedAt = new Date('2026-01-02T00:00:00.000Z'); return this; };
    const restore = setModelStubs(models, {
      Student: { findById: async (id) => (String(id) === studentId ? studentDoc : null) },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'PATCH', path: '/api/students/profile',
      headers: { Authorization: `Bearer ${token}` },
      body: { name: 'New Name', phone: '2222222222' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.profile.name, 'New Name');
    assert.strictEqual(res.body.data.profile.phone, '2222222222');
    assert.ok(saved, 'Profile changes should be saved');
    record('Student profile update', 'PASS', 'Updates allowed fields (name, phone) for authenticated student');
  } catch (err) {
    record('Student profile update', 'FAIL', err.message);
  }

  // 4) Invalid/privileged profile fields rejected
  try {
    const studentDoc = makeStudentDoc({ _id: studentId });
    const restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');

    const privileged = await httpRequest(app, {
      method: 'PATCH', path: '/api/students/profile',
      headers: { Authorization: `Bearer ${token}` },
      body: { email: 'hack@example.com', password: 'newpass', role: 'admin', isActive: false, isDemo: true },
    });
    const invalidField = await httpRequest(app, {
      method: 'PATCH', path: '/api/students/profile',
      headers: { Authorization: `Bearer ${token}` },
      body: { unknownField: 'x' },
    });
    const emptyBody = await httpRequest(app, {
      method: 'PATCH', path: '/api/students/profile',
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    restore();

    assert.strictEqual(privileged.status, 400);
    assert.strictEqual(invalidField.status, 400);
    assert.strictEqual(emptyBody.status, 400);
    record('Invalid/privileged profile fields rejected', 'PASS', 'Rejects privileged fields (email/password/role/isActive/isDemo), unknown fields, and empty updates');
  } catch (err) {
    record('Invalid/privileged profile fields rejected', 'FAIL', err.message);
  }

  // 5) Missing and invalid tokens
  try {
    const noToken = await httpRequest(app, { method: 'GET', path: '/api/students/profile' });
    const badToken = await httpRequest(app, { method: 'GET', path: '/api/students/profile', headers: { Authorization: 'Bearer bad.token' } });
    assert.strictEqual(noToken.status, 401);
    assert.strictEqual(badToken.status, 401);
    record('Missing/invalid tokens (student endpoints)', 'PASS', 'Student endpoints reject missing and invalid tokens');
  } catch (err) {
    record('Missing/invalid tokens (student endpoints)', 'FAIL', err.message);
  }

  // 6) Owner/admin denied student endpoints
  try {
    const ownerDoc = { _id: '65f400000000000000000001', name: 'Owner', email: 'owner@example.com', role: 'owner', isActive: true, isVerified: false, isDemo: false };
    const adminDoc = { _id: '65f500000000000000000001', name: 'Admin', email: 'admin@example.com', role: 'admin', isActive: true, isDemo: false };
    let restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async (id) => (String(id) === ownerDoc._id ? ownerDoc : null) },
      Admin: { findById: async () => null },
    });
    const ownerToken = makeToken(ownerDoc._id, 'owner');
    const ownerRes = await httpRequest(app, { method: 'GET', path: '/api/students/profile', headers: { Authorization: `Bearer ${ownerToken}` } });
    restore();

    restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => null },
      Admin: { findById: async (id) => (String(id) === adminDoc._id ? adminDoc : null) },
    });
    const adminToken = makeToken(adminDoc._id, 'admin');
    const adminRes = await httpRequest(app, { method: 'GET', path: '/api/students/profile', headers: { Authorization: `Bearer ${adminToken}` } });
    restore();

    assert.strictEqual(ownerRes.status, 403);
    assert.strictEqual(adminRes.status, 403);
    record('Owner/admin denied student endpoints', 'PASS', 'Non-student roles are denied by RBAC (403)');
  } catch (err) {
    record('Owner/admin denied student endpoints', 'FAIL', err.message);
  }

  // 7) Add favourite (approved accommodation)
  try {
    const studentDoc = makeStudentDoc({ _id: studentId, favourites: [] });
    let saved = false;
    studentDoc.save = async function () { saved = true; return this; };
    const approvedAcc = makeAccommodationDoc({ _id: approvedAccId, status: 'approved' });
    const restore = setModelStubs(models, {
      Student: { findById: async (id) => (String(id) === studentId ? studentDoc : null) },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === approvedAccId ? approvedAcc : null) },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/students/favourites/${approvedAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.ok(saved);
    assert.ok(studentDoc.favourites.map(String).includes(approvedAccId));
    record('Add favourite', 'PASS', 'Student can favourite an eligible approved accommodation');
  } catch (err) {
    record('Add favourite', 'FAIL', err.message);
  }

  // 8) Duplicate favourite prevention
  try {
    const studentDoc = makeStudentDoc({ _id: studentId, favourites: [approvedAccId] });
    const approvedAcc = makeAccommodationDoc({ _id: approvedAccId, status: 'approved' });
    const restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async () => approvedAcc },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/students/favourites/${approvedAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 409);
    record('Duplicate favourite prevention', 'PASS', 'Rejects adding an already-favourited accommodation');
  } catch (err) {
    record('Duplicate favourite prevention', 'FAIL', err.message);
  }

  // 9) Invalid accommodation ID
  try {
    const studentDoc = makeStudentDoc({ _id: studentId });
    const restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/students/favourites/${invalidAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 400);
    record('Invalid accommodation ID', 'PASS', 'Rejects invalid MongoDB ObjectId for favourite operations');
  } catch (err) {
    record('Invalid accommodation ID', 'FAIL', err.message);
  }

  // 10) Pending/rejected accommodation cannot be favourited
  try {
    const studentDoc = makeStudentDoc({ _id: studentId, favourites: [] });
    const pendingAcc = makeAccommodationDoc({ _id: pendingAccId, status: 'pending' });
    const rejectedAcc = makeAccommodationDoc({ _id: rejectedAccId, status: 'rejected' });
    const token = makeToken(studentId, 'student');

    let restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === pendingAccId ? pendingAcc : null) },
    });
    const pendingRes = await httpRequest(app, {
      method: 'POST', path: `/api/students/favourites/${pendingAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === rejectedAccId ? rejectedAcc : null) },
    });
    const rejectedRes = await httpRequest(app, {
      method: 'POST', path: `/api/students/favourites/${rejectedAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(pendingRes.status, 403);
    assert.strictEqual(rejectedRes.status, 403);
    record('Pending/rejected accommodation cannot be favourited', 'PASS', 'Only eligible approved accommodations can be favourited');
  } catch (err) {
    record('Pending/rejected accommodation cannot be favourited', 'FAIL', err.message);
  }

  // 11) Remove favourite
  try {
    const studentDoc = makeStudentDoc({ _id: studentId, favourites: [approvedAccId] });
    let saved = false;
    studentDoc.save = async function () { saved = true; return this; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => studentDoc },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/students/favourites/${approvedAccId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.ok(saved);
    assert.ok(!studentDoc.favourites.map(String).includes(approvedAccId));
    record('Remove favourite', 'PASS', 'Student can remove an existing favourite');
  } catch (err) {
    record('Remove favourite', 'FAIL', err.message);
  }

  // 12) Get favourites (handles deleted/unavailable references safely)
  try {
    const approvedAcc = makeAccommodationDoc({ _id: approvedAccId, status: 'approved' });
    const studentDoc = makeStudentDoc({ _id: studentId, favourites: [approvedAcc, null] }); // simulate deleted ref after populate
    const restore = setModelStubs(models, {
      Student: {
        findById: (id) => {
          if (String(id) === studentId) return withPopulate(studentDoc);
          return withPopulate(null);
        },
      },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
    });
    const token = makeToken(studentId, 'student');
    const res = await httpRequest(app, {
      method: 'GET', path: '/api/students/favourites',
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.count, 1);
    assert.strictEqual(res.body.data.favourites[0].id, approvedAccId);
    assert.ok(!JSON.stringify(res.body).includes('password'));
    record('Get favourites (safe handling)', 'PASS', 'Returns populated favourites and safely ignores deleted/null references');
  } catch (err) {
    record('Get favourites (safe handling)', 'FAIL', err.message);
  }

  // Blocked DB-dependent checks
  record('DB persistence for student profile/favourites', 'BLOCKED', 'No live isolated MongoDB configured; endpoint logic verified with stubs but actual persistence not executed');
  record('DB-backed favourite reference integrity (live populate/save)', 'BLOCKED', 'No live DB; deleted-reference handling verified with stubbed populated results');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
