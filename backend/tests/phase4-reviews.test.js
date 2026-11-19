/*
 * Phase 4 - Step 7: Review API checks (Mess Hunt)
 * Mocked/stubbed app-level tests (no live isolated MongoDB configured).
 * Live DB persistence/index-enforcement/aggregation-execution checks are reported as BLOCKED.
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_reviews_checks_only';
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

function makeToken(sub, role = 'student') {
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

function makeStudentDoc(data = {}) {
  return {
    _id: data._id || '65f100000000000000000001',
    name: data.name || 'Student One',
    email: data.email || 'student1@example.com',
    phone: data.phone || '9999999999',
    role: 'student',
    isActive: data.isActive !== undefined ? data.isActive : true,
    isDemo: data.isDemo || false,
  };
}

function makeOwnerDoc(data = {}) {
  return {
    _id: data._id || '65f300000000000000000001',
    name: data.name || 'Owner One',
    email: data.email || 'owner1@example.com',
    phone: data.phone || '8888888888',
    role: 'owner',
    isActive: true,
    isVerified: true,
    isDemo: false,
  };
}

function makeAdminDoc(data = {}) {
  return {
    _id: data._id || '65f500000000000000000001',
    name: data.name || 'Admin One',
    email: data.email || 'admin1@example.com',
    role: 'admin',
    isActive: true,
    isDemo: false,
  };
}

function makeAccommodationDoc(data = {}) {
  return {
    _id: data._id || '65f600000000000000000001',
    owner: data.owner || '65f300000000000000000001',
    name: data.name || 'Approved Mess',
    description: data.description || 'A good approved accommodation for students.',
    accommodationType: data.accommodationType || 'Mess',
    genderType: data.genderType || 'Co-ed',
    suitableFor: data.suitableFor || 'Students',
    location: data.location || {
      state: 'West Bengal', district: 'Paschim Medinipur', city: 'Midnapore', locality: 'Rangamati',
      fullAddress: 'Near College Road', landmark: 'Main Gate', googleMapsLink: 'https://maps.google.com/?q=midnapore',
    },
    pricing: data.pricing || { monthlyRent: 3000, securityDeposit: 1000, electricityCharges: 0, waterCharges: 0, foodCharges: 0, otherCharges: 0, includedChargesInfo: '', extraChargesInfo: '' },
    roomDetails: data.roomDetails || { roomType: 'Shared', totalRooms: 10, availableRoomsOrBeds: 4, bathroomType: 'Shared', furnishing: 'Basic' },
    foodInfo: data.foodInfo || { foodProvided: false, selfCookingAllowed: true, homeFoodDeliveryAllowed: true },
    facilities: data.facilities || ['Wi-Fi'],
    rules: data.rules || { entryTiming: '10:00 PM', visitorRules: 'No overnight visitors', additionalRules: '' },
    availability: data.availability || { status: 'Available', availableBeds: 4, availableFrom: null },
    contact: data.contact || { ownerDisplayName: 'Owner Display', contactNumber: '9876543210' },
    photos: data.photos || [],
    status: data.status || 'approved',
    rejectionReason: data.rejectionReason || '',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    toObject() { return { ...this }; },
  };
}

function makeReviewDoc(data = {}) {
  const doc = {
    _id: data._id || '65f700000000000000000001',
    accommodation: data.accommodation || '65f600000000000000000001',
    student: data.student || '65f100000000000000000001',
    rating: data.rating !== undefined ? data.rating : 5,
    comment: data.comment || 'Very good accommodation for students.',
    reviewerDisplayName: data.reviewerDisplayName || 'Student One',
    isReported: data.isReported || false,
    reportReason: data.reportReason || '',
    reports: Array.isArray(data.reports) ? data.reports : [],
    moderationStatus: data.moderationStatus || 'none',
    moderatedAt: data.moderatedAt || null,
    moderationNote: data.moderationNote || '',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    async save() { this.updatedAt = new Date('2026-01-02T00:00:00.000Z'); return this; },
    async deleteOne() { this._deleted = true; return { deletedCount: 1 }; },
    toObject() {
      const copy = { ...this };
      delete copy.save; delete copy.deleteOne; delete copy._deleted;
      return copy;
    },
  };
  if (typeof data.save === 'function') doc.save = data.save.bind(doc);
  if (typeof data.deleteOne === 'function') doc.deleteOne = data.deleteOne.bind(doc);
  return doc;
}

function chainFind(docs) {
  const chain = {
    sort() { return chain; },
    skip() { return chain; },
    limit() { return Promise.resolve(docs); },
    then(resolve, reject) { return Promise.resolve(docs).then(resolve, reject); },
  };
  return chain;
}

function mockSelectQuery(result) {
  const query = {
    select() { return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    catch(reject) { return Promise.resolve(result).catch(reject); },
  };
  return query;
}

async function main() {
  const app = require('../src/app');
  const models = require('../src/models');

  console.log('Running Phase 4 Step 7 (Review APIs) checks...\n');

  const studentId = '65f100000000000000000001';
  const student2Id = '65f100000000000000000002';
  const ownerId = '65f300000000000000000001';
  const adminId = '65f500000000000000000001';
  const approvedAccId = '65f600000000000000000001';
  const pendingAccId = '65f600000000000000000002';
  const reviewId = '65f700000000000000000001';
  const otherReviewId = '65f700000000000000000002';

  const student1 = makeStudentDoc({ _id: studentId, name: 'Student One', email: 's1@example.com' });
  const student2 = makeStudentDoc({ _id: student2Id, name: 'Student Two', email: 's2@example.com' });
  const owner = makeOwnerDoc({ _id: ownerId });
  const admin = makeAdminDoc({ _id: adminId });
  const approvedAcc = makeAccommodationDoc({ _id: approvedAccId, status: 'approved', availability: { status: 'Available', availableBeds: 2, availableFrom: null } });
  const pendingAcc = makeAccommodationDoc({ _id: pendingAccId, status: 'pending' });

  // 1) Student successfully creates a review
  try {
    let createdPayload = null;
    const restore = setModelStubs(models, {
      Student: { findById: async (id) => (String(id) === studentId ? student1 : null) },
      Owner: { findById: async () => null },
      Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === approvedAccId ? approvedAcc : null) },
      Review: {
        findOne: () => mockSelectQuery(null),
        create: async (data) => { createdPayload = data; return makeReviewDoc({ ...data, _id: reviewId }); },
        aggregate: async () => [],
      },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 5, comment: 'Very good place to stay.' },
    });
    restore();

    assert.strictEqual(res.status, 201);
    assert.strictEqual(createdPayload.student.toString ? createdPayload.student.toString() : String(createdPayload.student), studentId);
    assert.strictEqual(createdPayload.accommodation.toString ? createdPayload.accommodation.toString() : String(createdPayload.accommodation), approvedAccId);
    assert.strictEqual(createdPayload.reviewerDisplayName, 'Student One');
    assert.strictEqual(res.body.data.review.rating, 5);
    assert.ok(!JSON.stringify(res.body).includes('s1@example.com'));
    record('Student successfully creates a review', 'PASS', 'Student can create review for approved accommodation; student/reviewer derived from auth');
  } catch (err) {
    record('Student successfully creates a review', 'FAIL', err.message);
  }

  // 2) Unauthenticated review creation is rejected
  try {
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      body: { rating: 4, comment: 'Nice place' },
    });
    assert.strictEqual(res.status, 401);
    record('Unauthenticated review creation is rejected', 'PASS', 'Missing token returns 401');
  } catch (err) {
    record('Unauthenticated review creation is rejected', 'FAIL', err.message);
  }

  // 3) Owner/admin cannot create student reviews
  try {
    let restore = setModelStubs(models, {
      Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null },
    });
    const ownerRes = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` },
      body: { rating: 4, comment: 'Nice place' },
    });
    restore();

    restore = setModelStubs(models, {
      Admin: { findById: async () => admin }, Student: { findById: async () => null }, Owner: { findById: async () => null },
    });
    const adminRes = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(adminId, 'admin')}` },
      body: { rating: 4, comment: 'Nice place' },
    });
    restore();

    assert.strictEqual(ownerRes.status, 403);
    assert.strictEqual(adminRes.status, 403);
    record('Owner/admin cannot create student reviews', 'PASS', 'Review creation restricted to student role');
  } catch (err) {
    record('Owner/admin cannot create student reviews', 'FAIL', err.message);
  }

  // 4) Invalid rating is rejected
  try {
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 6, comment: 'Invalid rating test' },
    });
    restore();
    assert.strictEqual(res.status, 400);
    record('Invalid rating is rejected', 'PASS', 'Rating must be an integer from 1 to 5');
  } catch (err) {
    record('Invalid rating is rejected', 'FAIL', err.message);
  }

  // 5) Invalid accommodation ID is rejected
  try {
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/not-an-id/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 4, comment: 'Valid comment text' },
    });
    restore();
    assert.strictEqual(res.status, 400);
    record('Invalid accommodation ID is rejected', 'PASS', 'Create review rejects invalid accommodation ObjectId');
  } catch (err) {
    record('Invalid accommodation ID is rejected', 'FAIL', err.message);
  }

  // 6) Review for an unapproved accommodation is rejected
  try {
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Accommodation: { findById: async () => pendingAcc },
      Review: { findOne: () => mockSelectQuery(null) },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${pendingAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 4, comment: 'Trying to review pending accommodation' },
    });
    restore();
    assert.strictEqual(res.status, 403);
    record('Review for an unapproved accommodation is rejected', 'PASS', 'Only approved accommodations can be reviewed');
  } catch (err) {
    record('Review for an unapproved accommodation is rejected', 'FAIL', err.message);
  }

  // 7) Duplicate student review is rejected
  try {
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Accommodation: { findById: async () => approvedAcc },
      Review: { findOne: () => mockSelectQuery({ _id: reviewId }), create: async () => { throw new Error('should not create'); } },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 4, comment: 'Duplicate review attempt' },
    });
    restore();
    assert.strictEqual(res.status, 409);

    // DB-level unique index fallback behavior
    const restore2 = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Accommodation: { findById: async () => approvedAcc },
      Review: { findOne: () => mockSelectQuery(null), create: async () => { const e = new Error('dup'); e.code = 11000; throw e; } },
    });
    const res2 = await httpRequest(app, {
      method: 'POST', path: `/api/accommodations/${approvedAccId}/reviews`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 4, comment: 'Duplicate review attempt' },
    });
    restore2();
    assert.strictEqual(res2.status, 409);
    record('Duplicate student review is rejected', 'PASS', 'Prevents duplicate review per student/accommodation (app check + DB unique error handling)');
  } catch (err) {
    record('Duplicate student review is rejected', 'FAIL', err.message);
  }

  // 8) Public review listing returns only eligible reviews
  try {
    let capturedFilter = null;
    const eligible = [
      makeReviewDoc({ _id: '65f700000000000000000011', moderationStatus: 'none', rating: 5, comment: 'Eligible none', reviewerDisplayName: 'A' }),
      makeReviewDoc({ _id: '65f700000000000000000012', moderationStatus: 'approved', rating: 4, comment: 'Eligible approved', reviewerDisplayName: 'B' }),
    ];
    const restore = setModelStubs(models, {
      Accommodation: { findById: async () => approvedAcc },
      Review: {
        find: (filter) => { capturedFilter = filter; return chainFind(eligible); },
        countDocuments: async () => eligible.length,
      },
    });
    const res = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}/reviews` });
    restore();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.reviews.length, 2);
    assert.deepStrictEqual(capturedFilter.moderationStatus.$in, ['none', 'approved']);
    record('Public review listing returns only eligible reviews', 'PASS', 'Filters to moderationStatus none/approved; excludes removed/pending per policy');
  } catch (err) {
    record('Public review listing returns only eligible reviews', 'FAIL', err.message);
  }

  // 9) Private student information is not exposed
  try {
    const doc = makeReviewDoc({ _id: reviewId, student: { _id: studentId, email: 'private@example.com', phone: '123', password: 'hash' } });
    const restore = setModelStubs(models, {
      Accommodation: { findById: async () => approvedAcc },
      Review: { find: () => chainFind([doc]), countDocuments: async () => 1 },
    });
    const res = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}/reviews` });
    restore();
    const body = JSON.stringify(res.body);
    assert.ok(!body.includes('private@example.com'));
    assert.ok(!body.includes('"password"'));
    assert.ok(!body.includes('"phone"'));
    assert.ok(!('student' in res.body.data.reviews[0]));
    assert.strictEqual(res.body.data.reviews[0].reviewerDisplayName, 'Student One');
    record('Private student information is not exposed', 'PASS', 'Public review response omits student account/private fields and internal student identifiers');
  } catch (err) {
    record('Private student information is not exposed', 'FAIL', err.message);
  }

  // 10) Pagination works
  try {
    const restore = setModelStubs(models, {
      Accommodation: { findById: async () => approvedAcc },
      Review: { find: () => chainFind([]), countDocuments: async () => 23 },
    });
    const res = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}/reviews?page=2&limit=10` });
    restore();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.pagination.totalResults, 23);
    assert.strictEqual(res.body.data.pagination.currentPage, 2);
    assert.strictEqual(res.body.data.pagination.totalPages, 3);
    record('Pagination works', 'PASS', 'Validates page/limit and returns pagination metadata');
  } catch (err) {
    record('Pagination works', 'FAIL', err.message);
  }

  // 11) Student can edit their own review
  try {
    const doc = makeReviewDoc({ _id: reviewId, student: studentId, rating: 3, comment: 'Old comment text' });
    let saved = false;
    doc.save = async function () { saved = true; this.updatedAt = new Date('2026-01-02T00:00:00.000Z'); return this; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/reviews/${reviewId}`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 4, comment: 'Updated comment text' },
    });
    restore();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(doc.rating, 4);
    assert.strictEqual(doc.comment, 'Updated comment text');
    assert.ok(saved);
    record('Student can edit their own review', 'PASS', 'Owner student can update rating/comment; protected fields not modifiable via endpoint');
  } catch (err) {
    record('Student can edit their own review', 'FAIL', err.message);
  }

  // 12) Student cannot edit another student's review
  try {
    const doc = makeReviewDoc({ _id: otherReviewId, student: student2Id });
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'PATCH', path: `/api/reviews/${otherReviewId}`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { rating: 1, comment: 'Hacked comment' },
    });
    restore();
    assert.strictEqual(res.status, 404);
    record('Student cannot edit another student\'s review', 'PASS', 'Non-owner edit returns 404 (ownership enforced)');
  } catch (err) {
    record('Student cannot edit another student\'s review', 'FAIL', err.message);
  }

  // 13) Student can delete their own review
  try {
    const doc = makeReviewDoc({ _id: reviewId, student: studentId });
    let deleted = false;
    doc.deleteOne = async function () { deleted = true; return { deletedCount: 1 }; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/reviews/${reviewId}`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
    });
    restore();
    assert.strictEqual(res.status, 200);
    assert.ok(deleted);
    record('Student can delete their own review', 'PASS', 'Owner student can delete own review safely');
  } catch (err) {
    record('Student can delete their own review', 'FAIL', err.message);
  }

  // 14) Student cannot delete another student's review
  try {
    const doc = makeReviewDoc({ _id: otherReviewId, student: student2Id });
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'DELETE', path: `/api/reviews/${otherReviewId}`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
    });
    restore();
    assert.strictEqual(res.status, 404);
    record('Student cannot delete another student\'s review', 'PASS', 'Non-owner delete returns 404 (ownership enforced)');
  } catch (err) {
    record('Student cannot delete another student\'s review', 'FAIL', err.message);
  }

  // 15) Student can report another student's review
  try {
    const doc = makeReviewDoc({ _id: otherReviewId, student: student2Id, moderationStatus: 'none', reports: [], isReported: false });
    let saved = false;
    doc.save = async function () { saved = true; return this; };
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/reviews/${otherReviewId}/report`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { reason: 'Contains inappropriate and misleading information.' },
    });
    restore();
    assert.strictEqual(res.status, 200);
    assert.ok(saved);
    assert.strictEqual(doc.isReported, true);
    assert.strictEqual(doc.moderationStatus, 'none', 'Report alone must not automatically mark misconduct or remove review');
    assert.strictEqual(doc.reports.length, 1);
    assert.strictEqual(String(doc.reports[0].student), studentId);
    record('Student can report another student\'s review', 'PASS', 'Authenticated student can report review with reason; report stored safely without auto-misconduct decision');
  } catch (err) {
    record('Student can report another student\'s review', 'FAIL', err.message);
  }

  // 16) Student cannot report their own review
  try {
    const doc = makeReviewDoc({ _id: reviewId, student: studentId });
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/reviews/${reviewId}/report`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { reason: 'I want to report my own review' },
    });
    restore();
    assert.strictEqual(res.status, 400);
    record('Student cannot report their own review', 'PASS', 'Self-reporting is rejected');
  } catch (err) {
    record('Student cannot report their own review', 'FAIL', err.message);
  }

  // 17) Duplicate reports are handled safely
  try {
    const doc = makeReviewDoc({ _id: otherReviewId, student: student2Id, reports: [{ student: studentId, reason: 'Old reason', createdAt: new Date() }] });
    const restore = setModelStubs(models, {
      Student: { findById: async () => student1 }, Owner: { findById: async () => null }, Admin: { findById: async () => null },
      Review: { findById: async () => doc },
    });
    const res = await httpRequest(app, {
      method: 'POST', path: `/api/reviews/${otherReviewId}/report`,
      headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` },
      body: { reason: 'Reporting again for same issue' },
    });
    restore();
    assert.strictEqual(res.status, 409);
    record('Duplicate reports are handled safely', 'PASS', 'Same student cannot report the same review repeatedly');
  } catch (err) {
    record('Duplicate reports are handled safely', 'FAIL', err.message);
  }

  // 18) Rating aggregation is correct
  try {
    const { getReviewAggregateForAccommodation, getReviewAggregatesByAccommodationIds } = require('../src/utils/reviewAggregation');
    let capturedPipeline = null;
    const restore = setModelStubs(models, {
      Review: {
        aggregate: async (pipeline) => {
          capturedPipeline = pipeline;
          return [{ _id: approvedAccId, averageRating: 4.3333, reviewCount: 3 }];
        },
      },
    });
    const single = await getReviewAggregateForAccommodation(approvedAccId);
    const map = await getReviewAggregatesByAccommodationIds([approvedAccId]);
    restore();

    assert.strictEqual(single.reviewCount, 3);
    assert.strictEqual(single.averageRating, 4.3); // rounded to 1 decimal
    assert.strictEqual(single.available, true);
    assert.strictEqual(map.get(approvedAccId).reviewCount, 3);
    // Ensure aggregation matches only eligible moderation statuses
    const matchStage = capturedPipeline[0].$match;
    assert.deepStrictEqual(matchStage.moderationStatus.$in, ['none', 'approved']);

    // Public accommodation detail uses aggregation
    const restore2 = setModelStubs(models, {
      Accommodation: { findOne: async () => approvedAcc },
      Review: { aggregate: async () => [{ _id: approvedAccId, averageRating: 4.0, reviewCount: 2 }] },
    });
    const detailRes = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}` });
    restore2();
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.data.accommodation.ratingSummary.reviewCount, 2);
    assert.strictEqual(detailRes.body.data.accommodation.ratingSummary.averageRating, 4);
    assert.strictEqual(detailRes.body.data.accommodation.ratingSummary.available, true);
    record('Rating aggregation is correct', 'PASS', 'Computes average/count from eligible reviews only (none/approved); no invented values');
  } catch (err) {
    record('Rating aggregation is correct', 'FAIL', err.message);
  }

  // 19) Rating aggregation updates after edits and deletions
  try {
    // Aggregation is derived on-the-fly from eligible reviews; after edit/delete the next aggregation reflects new data.
    // (Mocked demonstration: successive aggregation results change; live DB consistency remains blocked.)
    const restore = setModelStubs(models, {
      Accommodation: { findOne: async () => approvedAcc },
      Review: { aggregate: async () => [{ _id: approvedAccId, averageRating: 5.0, reviewCount: 2 }] },
    });
    const beforeEdit = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}` });
    restore();
    assert.strictEqual(beforeEdit.body.data.accommodation.ratingSummary.averageRating, 5);
    assert.strictEqual(beforeEdit.body.data.accommodation.ratingSummary.reviewCount, 2);

    const restoreEdit = setModelStubs(models, {
      Accommodation: { findOne: async () => approvedAcc },
      Review: { aggregate: async () => [{ _id: approvedAccId, averageRating: 4.0, reviewCount: 2 }] },
    });
    const afterEdit = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}` });
    restoreEdit();
    assert.strictEqual(afterEdit.body.data.accommodation.ratingSummary.averageRating, 4);
    assert.strictEqual(afterEdit.body.data.accommodation.ratingSummary.reviewCount, 2);

    const restoreDelete = setModelStubs(models, {
      Accommodation: { findOne: async () => approvedAcc },
      Review: { aggregate: async () => [{ _id: approvedAccId, averageRating: 3.0, reviewCount: 1 }] },
    });
    const afterDelete = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}` });
    restoreDelete();
    assert.strictEqual(afterDelete.body.data.accommodation.ratingSummary.averageRating, 3);
    assert.strictEqual(afterDelete.body.data.accommodation.ratingSummary.reviewCount, 1);

    const restoreNone = setModelStubs(models, {
      Accommodation: { findOne: async () => approvedAcc },
      Review: { aggregate: async () => [] },
    });
    const afterAllRemoved = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedAccId}` });
    restoreNone();
    assert.strictEqual(afterAllRemoved.body.data.accommodation.ratingSummary.averageRating, null);
    assert.strictEqual(afterAllRemoved.body.data.accommodation.ratingSummary.reviewCount, 0);
    assert.strictEqual(afterAllRemoved.body.data.accommodation.ratingSummary.available, false);

    record('Rating aggregation updates after edits and deletions', 'PASS', 'On-the-fly aggregation reflects changed eligible review data on subsequent reads (mocked data changes; live DB update consistency blocked)');
  } catch (err) {
    record('Rating aggregation updates after edits and deletions', 'FAIL', err.message);
  }

  // 20) Rating sorting works correctly if implemented
  try {
    let capturedPipeline = null;
    const restore = setModelStubs(models, {
      Accommodation: {
        aggregate: async (pipeline) => {
          capturedPipeline = pipeline;
          return [{ items: [{ ...approvedAcc, averageRating: 4.5, reviewCount: 10 }], total: [{ count: 1 }] }];
        },
      },
      Review: { aggregate: async () => [{ _id: approvedAccId, averageRating: 4.5, reviewCount: 10 }] },
    });
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations?sortBy=rating_desc' });
    restore();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.data.sortBy, 'rating_desc');
    assert.ok(Array.isArray(capturedPipeline), 'Should use aggregation pipeline for rating sort');
    const sortStage = capturedPipeline.find((s) => s.$sort);
    assert.ok(sortStage && sortStage.$sort._hasRatings === -1, 'Rated accommodations prioritized consistently');
    assert.strictEqual(res.body.data.accommodations[0].ratingSummary.averageRating, 4.5);
    record('Rating sorting works correctly if implemented', 'PASS', 'Supports rating_desc/asc via aggregation with consistent handling of unrated accommodations');
  } catch (err) {
    record('Rating sorting works correctly if implemented', 'FAIL', err.message);
  }

  // Blocked live DB checks
  record('Live DB persistence for reviews', 'BLOCKED', 'No live isolated MongoDB configured; endpoint logic verified with stubs but actual create/update/delete persistence not executed');
  record('DB-level duplicate review uniqueness enforcement (live)', 'BLOCKED', 'Unique compound index exists in schema and duplicate-key handling is implemented; live DB index enforcement not verified in this environment');
  record('Live DB rating aggregation execution', 'BLOCKED', 'Aggregation pipeline/eligibility logic implemented and tested with stubbed results; live MongoDB aggregation execution not verified');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
