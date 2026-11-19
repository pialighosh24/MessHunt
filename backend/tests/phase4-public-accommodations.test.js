/*
 * Phase 4 - Step 6: Public Accommodation API checks (Mess Hunt)
 * Mocked/stubbed app-level tests (no live isolated MongoDB configured).
 */

const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_public_checks_only';
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

function makePublicDoc(data = {}) {
  return {
    _id: data._id || '65f600000000000000000001',
    owner: data.owner || '65f300000000000000000001', // must never leak in public response
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
    facilities: data.facilities || ['Wi-Fi', 'Water'],
    rules: data.rules || { entryTiming: '10:00 PM', visitorRules: 'No overnight visitors', additionalRules: '' },
    availability: data.availability || { status: 'Available', availableBeds: 4, availableFrom: null },
    contact: data.contact || { ownerDisplayName: 'Owner Display', contactNumber: '9876543210' },
    photos: data.photos || [{ url: '/uploads/p1.jpg', secureUrl: '/uploads/p1.jpg', filename: 'p1.jpg' }],
    status: data.status || 'approved',
    rejectionReason: data.rejectionReason || '',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    // simulate private owner account data if accidentally populated (must never appear)
    ownerAccount: data.ownerAccount || undefined,
    toObject() { return { ...this }; },
  };
}

function makeFindChain(docs, capture) {
  return (filter) => {
    capture.findFilter = filter;
    const chain = {
      sort(sortObj) { capture.sort = sortObj; return chain; },
      skip(n) { capture.skip = n; return chain; },
      limit(n) { capture.limit = n; return Promise.resolve(docs); },
      then(resolve, reject) { return Promise.resolve(docs).then(resolve, reject); },
    };
    return chain;
  };
}

async function main() {
  const app = require('../src/app');
  const models = require('../src/models');

  console.log('Running Phase 4 Step 6 (Public Accommodation APIs) checks...\n');

  const approvedId = '65f600000000000000000001';

  // 1) Public listing retrieval
  try {
    const capture = {};
    const docs = [makePublicDoc({ _id: approvedId })];
    const restore = setModelStubs(models, {
      Accommodation: {
        find: makeFindChain(docs, capture),
        countDocuments: async (filter) => { capture.countFilter = filter; return 1; },
        findOne: async () => null,
      },
      Review: {
        aggregate: async () => [],
      },
    });
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    restore();

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.data.accommodations));
    assert.strictEqual(res.body.data.accommodations.length, 1);
    assert.strictEqual(res.body.data.accommodations[0].id, approvedId);
    assert.ok(res.body.data.pagination);
    assert.ok(res.body.data.accommodations[0].ratingSummary, 'ratingSummary should be present');
    assert.strictEqual(res.body.data.accommodations[0].reviewCount, 0);
    record('Public listing retrieval', 'PASS', 'Returns public accommodations with pagination metadata and rating summary fields');
  } catch (err) {
    record('Public listing retrieval', 'FAIL', err.message);
  }

  // 2,3,4,5) Approved-only visibility and exclusions in base filter
  try {
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: {
        find: makeFindChain([], capture),
        countDocuments: async () => 0,
      },
      Review: { aggregate: async () => [] },
    });
    await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    restore();

    assert.strictEqual(capture.findFilter.status, 'approved', 'Base filter must require approved status');
    assert.strictEqual(capture.findFilter['availability.status'], 'Available', 'Base filter must exclude unavailable/full listings');
    record('Approved-only visibility (base filter)', 'PASS', 'Public search always filters status=approved');
    record('Pending listing excluded', 'PASS', 'Pending listings cannot match approved-only base filter');
    record('Rejected listing excluded', 'PASS', 'Rejected listings cannot match approved-only base filter');
    record('Unavailable listing excluded', 'PASS', 'Unavailable/full listings excluded from default public search');
  } catch (err) {
    record('Approved-only visibility (base filter)', 'FAIL', err.message);
    record('Pending listing excluded', 'FAIL', err.message);
    record('Rejected listing excluded', 'FAIL', err.message);
    record('Unavailable listing excluded', 'FAIL', err.message);
  }

  // 6) City/locality filters (safe regex)
  try {
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], capture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    await httpRequest(app, { method: 'GET', path: '/api/accommodations?city=Midnapore&locality=Ranga.mati' });
    restore();

    assert.ok(capture.findFilter['location.city'].$regex, 'City filter should use regex');
    assert.ok(capture.findFilter['location.locality'].$regex, 'Locality filter should use regex');
    assert.ok(capture.findFilter['location.locality'].$regex.includes('\\.'), 'User input should be regex-escaped');
    assert.strictEqual(capture.findFilter['location.city'].$options, 'i');
    record('City/locality filters', 'PASS', 'Applies case-insensitive, escaped string filters safely');
  } catch (err) {
    record('City/locality filters', 'FAIL', err.message);
  }

  // 7) Rent range filters
  try {
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], capture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    await httpRequest(app, { method: 'GET', path: '/api/accommodations?minRent=2000&maxRent=5000' });
    restore();

    assert.strictEqual(capture.findFilter['pricing.monthlyRent'].$gte, 2000);
    assert.strictEqual(capture.findFilter['pricing.monthlyRent'].$lte, 5000);
    record('Rent range filters', 'PASS', 'Applies min/max monthly rent filters');
  } catch (err) {
    record('Rent range filters', 'FAIL', err.message);
  }

  // 8) Accommodation type and gender filters
  try {
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], capture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    await httpRequest(app, { method: 'GET', path: '/api/accommodations?accommodationType=PG&genderType=Girls' });
    restore();

    assert.strictEqual(capture.findFilter.accommodationType, 'PG');
    assert.strictEqual(capture.findFilter.genderType, 'Girls');
    record('Accommodation type and gender filters', 'PASS', 'Applies validated enum filters');
  } catch (err) {
    record('Accommodation type and gender filters', 'FAIL', err.message);
  }

  // 9) Food and room filters
  try {
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], capture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    await httpRequest(app, { method: 'GET', path: '/api/accommodations?roomType=Single&foodProvided=true&selfCookingAllowed=false&homeFoodDeliveryAllowed=1' });
    restore();

    assert.strictEqual(capture.findFilter['roomDetails.roomType'], 'Single');
    assert.strictEqual(capture.findFilter['foodInfo.foodProvided'], true);
    assert.strictEqual(capture.findFilter['foodInfo.selfCookingAllowed'], false);
    assert.strictEqual(capture.findFilter['foodInfo.homeFoodDeliveryAllowed'], true);
    record('Food and room filters', 'PASS', 'Applies room type and boolean food filters correctly');
  } catch (err) {
    record('Food and room filters', 'FAIL', err.message);
  }

  // 10) Pagination
  try {
    const capture = {};
    const docs = [makePublicDoc({ _id: approvedId })];
    const restore = setModelStubs(models, {
      Accommodation: {
        find: makeFindChain(docs, capture),
        countDocuments: async () => 25,
      },
      Review: { aggregate: async () => [] },
    });
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations?page=2&limit=10' });
    restore();

    assert.strictEqual(capture.skip, 10);
    assert.strictEqual(capture.limit, 10);
    assert.strictEqual(res.body.data.pagination.totalResults, 25);
    assert.strictEqual(res.body.data.pagination.currentPage, 2);
    assert.strictEqual(res.body.data.pagination.totalPages, 3);
    assert.strictEqual(res.body.data.pagination.hasNextPage, true);
    assert.strictEqual(res.body.data.pagination.hasPrevPage, true);
    record('Pagination', 'PASS', 'Applies page/limit and returns total results, current page, total pages');
  } catch (err) {
    record('Pagination', 'FAIL', err.message);
  }

  // 11) Sorting
  try {
    const rentCapture = {};
    let restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], rentCapture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    const rentRes = await httpRequest(app, { method: 'GET', path: '/api/accommodations?sortBy=rent_asc' });
    restore();
    assert.deepStrictEqual(rentCapture.sort, { 'pricing.monthlyRent': 1, createdAt: -1 });
    assert.strictEqual(rentRes.body.data.sortBy, 'rent_asc');

    const newestCapture = {};
    restore = setModelStubs(models, {
      Accommodation: { find: makeFindChain([], newestCapture), countDocuments: async () => 0 },
      Review: { aggregate: async () => [] },
    });
    const newestRes = await httpRequest(app, { method: 'GET', path: '/api/accommodations?sortBy=newest' });
    restore();
    assert.deepStrictEqual(newestCapture.sort, { createdAt: -1 });
    assert.strictEqual(newestRes.body.data.sortBy, 'newest');

    // Rating sort now supported (Step 7): uses Accommodation.aggregate pipeline
    let aggCalled = false;
    restore = setModelStubs(models, {
      Accommodation: {
        aggregate: async (pipeline) => {
          aggCalled = true;
          return [{ items: [], total: [] }];
        },
        find: makeFindChain([], {}),
        countDocuments: async () => 0,
      },
      Review: { aggregate: async () => [] },
    });
    const ratingRes = await httpRequest(app, { method: 'GET', path: '/api/accommodations?sortBy=rating_desc' });
    restore();
    assert.strictEqual(ratingRes.status, 200);
    assert.strictEqual(ratingRes.body.data.sortBy, 'rating_desc');
    assert.ok(aggCalled, 'Rating sort should use aggregation pipeline');

    record('Sorting', 'PASS', 'Supports rent, newest, and rating-based sorting (rating sort uses aggregation from eligible reviews)');
  } catch (err) {
    record('Sorting', 'FAIL', err.message);
  }

  // 12) Invalid query parameters
  try {
    const cases = [
      '/api/accommodations?unknownFilter=x',
      '/api/accommodations?minRent=abc',
      '/api/accommodations?minRent=5000&maxRent=1000',
      '/api/accommodations?accommodationType=Hotel',
      '/api/accommodations?genderType=Anyone',
      '/api/accommodations?roomType=Huge',
      '/api/accommodations?foodProvided=maybe',
      '/api/accommodations?page=0',
      '/api/accommodations?limit=1000',
      '/api/accommodations?sortBy=unknown_sort',
      '/api/accommodations?availability=Full',
    ];

    for (const path of cases) {
      const res = await httpRequest(app, { method: 'GET', path });
      assert.strictEqual(res.status, 400, `Expected 400 for ${path}, got ${res.status}`);
    }

    record('Invalid query parameters', 'PASS', 'Rejects unsupported filters, invalid ranges/enums/booleans/pagination/sort values, and non-public availability');
  } catch (err) {
    record('Invalid query parameters', 'FAIL', err.message);
  }

  // 13) Invalid accommodation ID (detail)
  try {
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations/not-an-id' });
    assert.strictEqual(res.status, 400);
    record('Invalid accommodation ID', 'PASS', 'Detail endpoint rejects invalid MongoDB ObjectId');
  } catch (err) {
    record('Invalid accommodation ID', 'FAIL', err.message);
  }

  // 14) Pending/rejected/unavailable detail returns 404
  try {
    const cases = [
      { label: 'pending', doc: null }, // query enforces approved+available so not found
      { label: 'rejected', doc: null },
      { label: 'unavailable', doc: null },
    ];
    // We verify findOne is called with approved+available constraints and that null => 404
    const capture = {};
    const restore = setModelStubs(models, {
      Accommodation: {
        findOne: async (filter) => { capture.filter = filter; return null; },
      },
    });
    const resPendingLike = await httpRequest(app, { method: 'GET', path: '/api/accommodations/65f600000000000000000099' });
    restore();

    assert.strictEqual(resPendingLike.status, 404);
    assert.strictEqual(capture.filter.status, 'approved');
    assert.strictEqual(capture.filter['availability.status'], 'Available');
    record('Pending/rejected/unavailable/deleted detail returns 404', 'PASS', 'Detail lookup requires approved+available; non-matching/non-public listings return 404');
  } catch (err) {
    record('Pending/rejected/unavailable/deleted detail returns 404', 'FAIL', err.message);
  }

  // 15) Private owner fields never appear in public responses
  try {
    const doc = makePublicDoc({
      _id: approvedId,
      owner: { _id: '65f300000000000000000001', name: 'Private Owner', email: 'owner@private.com', password: 'hash', role: 'owner', isVerified: true },
      ownerAccount: { email: 'owner@private.com', password: 'secret' },
    });
    const restore = setModelStubs(models, {
      Accommodation: {
        find: (filter) => ({ sort: () => ({ skip: () => ({ limit: async () => [doc] }) }) }),
        countDocuments: async () => 1,
        findOne: async () => doc,
      },
      Review: { aggregate: async () => [] },
    });
    const listRes = await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    const detailRes = await httpRequest(app, { method: 'GET', path: `/api/accommodations/${approvedId}` });
    restore();

    const listBody = JSON.stringify(listRes.body);
    const detailBody = JSON.stringify(detailRes.body);

    assert.ok(!listBody.includes('owner@private.com'), 'Owner email must not appear in public list response');
    assert.ok(!listBody.includes('hash'), 'Password/hash must not appear in public list response');
    assert.ok(!detailBody.includes('owner@private.com'), 'Owner email must not appear in public detail response');
    assert.ok(!detailBody.includes('"password"'), 'Password field must not appear in public detail response');
    assert.ok(!detailBody.includes('ownerAccount'), 'Private owner account fields must not appear');
    assert.strictEqual(listRes.body.data.accommodations[0].contact.ownerDisplayName, 'Owner Display');
    assert.strictEqual(detailRes.body.data.accommodation.contact.contactNumber, '9876543210');
    assert.ok(!('owner' in listRes.body.data.accommodations[0]), 'Owner account reference/object must not be exposed publicly');
    record('Private owner fields never appear in public responses', 'PASS', 'Public serializer exposes listing contact info only (no owner email/password/auth/internal account fields)');
  } catch (err) {
    record('Private owner fields never appear in public responses', 'FAIL', err.message);
  }

  // Blocked DB-dependent checks
  record('Live DB query/filter execution and persistence', 'BLOCKED', 'No live isolated MongoDB configured; filter/sort/pagination/query construction and aggregation wiring verified with stubs but actual DB execution not performed');
  record('Reliable rating aggregation from eligible reviews (live DB)', 'BLOCKED', 'Aggregation logic implemented in Step 7 (eligible moderation statuses, no invented values) but live DB aggregation/persistence verification not performed in this environment');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
