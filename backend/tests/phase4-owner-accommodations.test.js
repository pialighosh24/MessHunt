/*
 * Phase 4 - Step 5: Owner Accommodation API checks (Mess Hunt)
 * Mocked/stubbed app-level tests (no live isolated MongoDB configured).
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_owner_checks_only';
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

function makeToken(sub, role = 'owner') {
  return jwt.sign({ sub, role }, process.env.JWT_SECRET, { expiresIn: '1h', issuer: process.env.JWT_ISSUER });
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

function makeOwnerDoc(id = '65f300000000000000000001') {
  return { _id: id, name: 'Owner One', email: 'owner1@example.com', phone: '9999999999', role: 'owner', isActive: true, isVerified: true, isDemo: false };
}
function makeStudentDoc(id = '65f100000000000000000001') {
  return { _id: id, name: 'Student One', email: 'student1@example.com', role: 'student', isActive: true, isDemo: false, phone: '' };
}
function makeAdminDoc(id = '65f500000000000000000001') {
  return { _id: id, name: 'Admin One', email: 'admin1@example.com', role: 'admin', isActive: true, isDemo: false };
}

function validPayload(overrides = {}) {
  return {
    name: 'Shanti Mess',
    description: 'Clean and affordable student mess near college with basic facilities.',
    accommodationType: 'Mess',
    genderType: 'Co-ed',
    suitableFor: 'Students',
    location: {
      state: 'West Bengal',
      district: 'Paschim Medinipur',
      city: 'Midnapore',
      locality: 'Rangamati',
      fullAddress: 'Near Vidyasagar University Gate',
      landmark: 'University Main Gate',
      googleMapsLink: 'https://maps.google.com/?q=vidyasagar+university',
    },
    pricing: {
      monthlyRent: 2800,
      securityDeposit: 1000,
      electricityCharges: 0,
      waterCharges: 0,
      foodCharges: 0,
      otherCharges: 0,
      includedChargesInfo: 'Water included',
      extraChargesInfo: 'Electricity extra as per usage',
    },
    roomDetails: {
      roomType: 'Shared',
      totalRooms: 10,
      availableRoomsOrBeds: 4,
      bathroomType: 'Shared',
      furnishing: 'Bed and table',
    },
    foodInfo: {
      foodProvided: false,
      selfCookingAllowed: false,
      homeFoodDeliveryAllowed: true,
    },
    facilities: ['Wi-Fi', 'Drinking Water', 'Study Table'],
    rules: {
      entryTiming: '10:00 PM',
      visitorRules: 'No overnight visitors',
      additionalRules: 'Maintain cleanliness',
    },
    availability: {
      status: 'Available',
      availableBeds: 4,
      availableFrom: '2026-12-01',
    },
    contact: {
      ownerDisplayName: 'Owner One',
      contactNumber: '9876543210',
    },
    ...overrides,
  };
}

function makeAccommodationDoc(data = {}) {
  const doc = {
    _id: data._id || '65f600000000000000000001',
    owner: data.owner || '65f300000000000000000001',
    name: data.name || 'Shanti Mess',
    description: data.description || 'Clean and affordable student mess near college with basic facilities.',
    accommodationType: data.accommodationType || 'Mess',
    genderType: data.genderType || 'Co-ed',
    suitableFor: data.suitableFor || 'Students',
    location: data.location || {
      state: 'West Bengal', district: 'Paschim Medinipur', city: 'Midnapore', locality: 'Rangamati',
      fullAddress: 'Near Vidyasagar University Gate', landmark: 'University Main Gate', googleMapsLink: 'https://maps.google.com/?q=vidyasagar+university',
    },
    pricing: data.pricing || { monthlyRent: 2800, securityDeposit: 1000, electricityCharges: 0, waterCharges: 0, foodCharges: 0, otherCharges: 0, includedChargesInfo: 'Water included', extraChargesInfo: 'Electricity extra' },
    roomDetails: data.roomDetails || { roomType: 'Shared', totalRooms: 10, availableRoomsOrBeds: 4, bathroomType: 'Shared', furnishing: 'Bed and table' },
    foodInfo: data.foodInfo || { foodProvided: false, selfCookingAllowed: false, homeFoodDeliveryAllowed: true },
    facilities: data.facilities || ['Wi-Fi', 'Drinking Water'],
    rules: data.rules || { entryTiming: '10:00 PM', visitorRules: 'No overnight visitors', additionalRules: 'Maintain cleanliness' },
    availability: data.availability || { status: 'Available', availableBeds: 4, availableFrom: null },
    contact: data.contact || { ownerDisplayName: 'Owner One', contactNumber: '9876543210' },
    photos: data.photos || [],
    status: data.status || 'pending',
    rejectionReason: data.rejectionReason || '',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    async save() { this.updatedAt = new Date('2026-01-02T00:00:00.000Z'); return this; },
    async deleteOne() { this._deleted = true; return { deletedCount: 1 }; },
    toObject() {
      const obj = { ...this };
      delete obj.save; delete obj.deleteOne; delete obj._deleted;
      return JSON.parse(JSON.stringify(obj, (k, v) => (k === 'owner' ? String(v) : v)));
    },
  };
  if (typeof data.save === 'function') doc.save = data.save.bind(doc);
  if (typeof data.deleteOne === 'function') doc.deleteOne = data.deleteOne.bind(doc);
  return doc;
}

async function main() {
  const app = require('../src/app');
  const models = require('../src/models');

  console.log('Running Phase 4 Step 5 (Owner Accommodation APIs) checks...\n');

  const ownerId = '65f300000000000000000001';
  const otherOwnerId = '65f300000000000000000002';
  const accId = '65f600000000000000000001';
  const otherAccId = '65f600000000000000000002';

  // 1 & 2) Create accommodation and default pending
  try {
    const owner = makeOwnerDoc(ownerId);
    let createdPayload = null;
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async (id) => (String(id) === ownerId ? owner : null) },
      Admin: { findById: async () => null },
      Accommodation: {
        create: async (data) => { createdPayload = data; return makeAccommodationDoc({ ...data, _id: accId }); },
        find: async () => [], findById: async () => null,
      },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/owners/accommodations',
      headers: { Authorization: `Bearer ${token}` },
      body: validPayload(),
    });
    restore();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.data.accommodation.status, 'pending');
    assert.strictEqual(String(createdPayload.owner), ownerId, 'Owner must be derived from authenticated account');
    assert.strictEqual(createdPayload.status, 'pending');
    assert.strictEqual(createdPayload.isDemo, false);
    record('Owner can create accommodation', 'PASS', 'Authenticated owner can create listing (owner derived from token)');
    record('New listing defaults to pending', 'PASS', 'Created accommodation status is forced to pending');
  } catch (err) {
    record('Owner can create accommodation', 'FAIL', err.message);
    record('New listing defaults to pending', 'FAIL', err.message);
  }

  // 3) Owner can retrieve their own listings
  try {
    const owner = makeOwnerDoc(ownerId);
    const docs = [makeAccommodationDoc({ _id: accId, owner: ownerId }), makeAccommodationDoc({ _id: '65f600000000000000000099', owner: ownerId, status: 'approved' })];
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: {
        find: (q) => ({ sort: async () => (String(q.owner) === ownerId ? docs : []) }),
      },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, { method: 'GET', path: '/api/owners/accommodations', headers: { Authorization: `Bearer ${token}` } });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.count, 2);
    assert.ok(res.body.data.accommodations.every((a) => String(a.owner) === ownerId));
    record('Owner can retrieve own listings', 'PASS', 'Returns only authenticated owner listings');
  } catch (err) {
    record('Owner can retrieve own listings', 'FAIL', err.message);
  }

  // 4) Owner can update their own listing
  try {
    const owner = makeOwnerDoc(ownerId);
    const doc = makeAccommodationDoc({ _id: accId, owner: ownerId, status: 'pending' });
    let saved = false;
    doc.save = async function () { saved = true; return this; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === accId ? doc : null) },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/owners/accommodations/${accId}`,
      headers: { Authorization: `Bearer ${token}` },
      body: { name: 'Updated Mess Name', pricing: { monthlyRent: 3200 } },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.accommodation.name, 'Updated Mess Name');
    assert.strictEqual(res.body.data.accommodation.pricing.monthlyRent, 3200);
    assert.ok(saved);
    record('Owner can update own listing', 'PASS', 'Owner can update own listing with valid partial nested data');
  } catch (err) {
    record('Owner can update own listing', 'FAIL', err.message);
  }

  // 5) Owner can delete their own listing
  try {
    const owner = makeOwnerDoc(ownerId);
    const doc = makeAccommodationDoc({ _id: accId, owner: ownerId });
    let deleted = false;
    doc.deleteOne = async function () { deleted = true; return { deletedCount: 1 }; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === accId ? doc : null) },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/owners/accommodations/${accId}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.ok(deleted);
    record('Owner can delete own listing', 'PASS', 'Ownership-checked deletion succeeds for owner');
  } catch (err) {
    record('Owner can delete own listing', 'FAIL', err.message);
  }

  // 6) Owner cannot access another owner's listing
  try {
    const owner = makeOwnerDoc(ownerId);
    const otherDoc = makeAccommodationDoc({ _id: otherAccId, owner: otherOwnerId });
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === otherAccId ? otherDoc : null) },
    });
    const token = makeToken(ownerId, 'owner');
    const getRes = await httpRequest(app, { method: 'GET', path: `/api/owners/accommodations/${otherAccId}`, headers: { Authorization: `Bearer ${token}` } });
    const patchRes = await httpRequest(app, { method: 'PATCH', path: `/api/owners/accommodations/${otherAccId}`, headers: { Authorization: `Bearer ${token}` }, body: { name: 'Hack' } });
    const delRes = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${otherAccId}`, headers: { Authorization: `Bearer ${token}` } });
    restore();

    assert.strictEqual(getRes.status, 404);
    assert.strictEqual(patchRes.status, 404);
    assert.strictEqual(delRes.status, 404);
    record('Owner cannot access another owner\'s listing', 'PASS', 'Guessed/other-owner IDs do not expose or allow access (404)');
  } catch (err) {
    record('Owner cannot access another owner\'s listing', 'FAIL', err.message);
  }

  // 7) Owner cannot set approval/protected status fields
  try {
    const owner = makeOwnerDoc(ownerId);
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: {
        create: async () => { throw new Error('should not create'); },
        findById: async () => makeAccommodationDoc({ _id: accId, owner: ownerId, status: 'pending' }),
      },
    });
    const token = makeToken(ownerId, 'owner');
    const createRes = await httpRequest(app, {
      method: 'POST', path: '/api/owners/accommodations',
      headers: { Authorization: `Bearer ${token}` },
      body: { ...validPayload(), status: 'approved', owner: otherOwnerId, isDemo: true },
    });
    const updateRes = await httpRequest(app, {
      method: 'PATCH', path: `/api/owners/accommodations/${accId}`,
      headers: { Authorization: `Bearer ${token}` },
      body: { status: 'approved', rejectionReason: 'self-approve', owner: otherOwnerId },
    });
    restore();

    assert.strictEqual(createRes.status, 400);
    assert.strictEqual(updateRes.status, 400);
    record('Owner cannot set approval/protected fields', 'PASS', 'Rejects owner attempts to set status/owner/isDemo/rejectionReason');
  } catch (err) {
    record('Owner cannot set approval/protected fields', 'FAIL', err.message);
  }

  // 8) Editing approved listing triggers re-review
  try {
    const owner = makeOwnerDoc(ownerId);
    const doc = makeAccommodationDoc({ _id: accId, owner: ownerId, status: 'approved', rejectionReason: '' });
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { findById: async () => doc },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/owners/accommodations/${accId}`,
      headers: { Authorization: `Bearer ${token}` },
      body: { description: 'Updated description to trigger admin re-review for accuracy.' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(doc.status, 'pending');
    assert.strictEqual(doc.rejectionReason, '');
    assert.match(res.body.message, /re-review/i);
    record('Editing approved listing triggers re-review', 'PASS', 'Approved listing substantive edit sets status back to pending for re-review');
  } catch (err) {
    record('Editing approved listing triggers re-review', 'FAIL', err.message);
  }

  // 9) Rejected listing resubmission behaves correctly
  try {
    const owner = makeOwnerDoc(ownerId);
    const doc = makeAccommodationDoc({ _id: accId, owner: ownerId, status: 'rejected', rejectionReason: 'Photos unclear' });
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { findById: async () => doc },
    });
    const token = makeToken(ownerId, 'owner');
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/owners/accommodations/${accId}`,
      headers: { Authorization: `Bearer ${token}` },
      body: { name: 'Resubmitted Mess Name' },
    });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(doc.status, 'pending');
    assert.strictEqual(doc.rejectionReason, '', 'Rejection reason retained while rejected; cleared on resubmission');
    assert.match(res.body.message, /resubmitted/i);
    record('Rejected listing resubmission behaves correctly', 'PASS', 'Rejected listing edit resubmits to pending and clears rejection reason on resubmission');
  } catch (err) {
    record('Rejected listing resubmission behaves correctly', 'FAIL', err.message);
  }

  // 10) Invalid nested data is rejected
  try {
    const owner = makeOwnerDoc(ownerId);
    const restore = setModelStubs(models, {
      Student: { findById: async () => null },
      Owner: { findById: async () => owner },
      Admin: { findById: async () => null },
      Accommodation: { create: async () => { throw new Error('should not create'); }, findById: async () => null },
    });
    const token = makeToken(ownerId, 'owner');
    const bad = {
      name: 'A',
      description: 'short',
      accommodationType: 'Hotel',
      genderType: 'Anyone',
      location: { state: '', district: '', city: '', locality: '', fullAddress: '', googleMapsLink: 'not-a-url' },
      pricing: { monthlyRent: -5 },
      roomDetails: { roomType: 'Huge', bathroomType: 'Open' },
      contact: { ownerDisplayName: '', contactNumber: '12' },
      foodInfo: { foodProvided: 'yes' },
    };
    const res = await httpRequest(app, {
      method: 'POST', path: '/api/owners/accommodations',
      headers: { Authorization: `Bearer ${token}` },
      body: bad,
    });
    restore();

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(Array.isArray(res.body.errors) && res.body.errors.length > 0);
    record('Invalid nested data is rejected', 'PASS', 'Validates nested fields (location/pricing/room/food/contact/enums/URLs/numbers)');
  } catch (err) {
    record('Invalid nested data is rejected', 'FAIL', err.message);
  }

  // 11) Student/admin access is denied
  try {
    const student = makeStudentDoc();
    const admin = makeAdminDoc();
    let restore = setModelStubs(models, {
      Student: { findById: async () => student }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
    });
    const studentRes = await httpRequest(app, { method: 'GET', path: '/api/owners/accommodations', headers: { Authorization: `Bearer ${makeToken(student._id, 'student')}` } });
    restore();
    restore = setModelStubs(models, {
      Student: { findById: async () => null }, Owner: { findById: async () => null }, Admin: { findById: async () => admin },
    });
    const adminRes = await httpRequest(app, { method: 'GET', path: '/api/owners/accommodations', headers: { Authorization: `Bearer ${makeToken(admin._id, 'admin')}` } });
    restore();

    assert.strictEqual(studentRes.status, 403);
    assert.strictEqual(adminRes.status, 403);
    record('Student/admin access is denied', 'PASS', 'Owner accommodation routes are restricted to owners (403)');
  } catch (err) {
    record('Student/admin access is denied', 'FAIL', err.message);
  }

  // 12) Missing and invalid tokens are rejected
  try {
    const missing = await httpRequest(app, { method: 'GET', path: '/api/owners/accommodations' });
    const invalid = await httpRequest(app, { method: 'GET', path: '/api/owners/accommodations', headers: { Authorization: 'Bearer invalid.token' } });
    assert.strictEqual(missing.status, 401);
    assert.strictEqual(invalid.status, 401);
    record('Missing and invalid tokens are rejected', 'PASS', 'Owner routes require valid authentication token');
  } catch (err) {
    record('Missing and invalid tokens are rejected', 'FAIL', err.message);
  }

  // Blocked DB-dependent checks
  record('DB persistence for owner accommodations', 'BLOCKED', 'No live isolated MongoDB configured; endpoint logic verified with stubs but actual persistence not executed');
  record('DB-level ownership/query integrity (live)', 'BLOCKED', 'No live DB; ownership filtering and access control verified with stubbed queries');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
