/*
 * Phase 4 - Step 9 / 9.1: Cloudinary Image Upload & Storage checks (Mess Hunt)
 * Uses MOCKED Cloudinary SDK calls and mocked/stubbed MongoDB model operations.
 * No actual Cloudinary uploads/deletions are performed. No live MongoDB configured.
 *
 * Step 9.1 adds reliability hardening tests (two-stage deletion recovery, cleanup result
 * handling/logging behavior verification where observable, config-missing 503s, auth/role
 * checks for delete, empty upload, legacy records, pending-deletion serialization exclusion).
 */

const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_for_phase4_image_upload_checks_only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_ISSUER = 'mess-hunt-api';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
process.env.CLOUDINARY_ACCOMMODATION_FOLDER = 'mess-hunt/accommodations';
process.env.MAX_UPLOAD_SIZE_MB = '5';
process.env.MAX_PHOTOS_PER_ACCOMMODATION = '10';

const results = [];
function record(name, status, details = '') {
  results.push({ name, status, details });
  console.log(`[${status}] ${name}${details ? ` - ${details}` : ''}`);
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

function setEnv(vars) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
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

function getActivePhotoCount(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => !(p && p.deletionStatus === 'pending_deletion')).length;
}

function makeAccommodationDoc(data = {}) {
  const doc = {
    _id: data._id || '65f600000000000000000001',
    owner: data.owner || '65f300000000000000000001',
    name: data.name || 'Test Mess',
    description: data.description || 'Valid accommodation description for image upload tests.',
    accommodationType: data.accommodationType || 'Mess',
    genderType: data.genderType || 'Co-ed',
    suitableFor: data.suitableFor || 'Students',
    location: data.location || { state: 'WB', district: 'PM', city: 'Midnapore', locality: 'Rangamati', fullAddress: 'Addr', landmark: '', googleMapsLink: 'https://maps.google.com/?q=test' },
    pricing: data.pricing || { monthlyRent: 3000 },
    roomDetails: data.roomDetails || { roomType: 'Shared', bathroomType: 'Shared' },
    foodInfo: data.foodInfo || {},
    facilities: data.facilities || [],
    rules: data.rules || {},
    availability: data.availability || { status: 'Available', availableBeds: 1, availableFrom: null },
    contact: data.contact || { ownerDisplayName: 'Owner', contactNumber: '9876543210' },
    photos: Array.isArray(data.photos) ? data.photos : [],
    status: data.status || 'approved',
    rejectionReason: data.rejectionReason || '',
    isDemo: data.isDemo || false,
    createdAt: data.createdAt || new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: data.updatedAt || new Date('2026-01-01T00:00:00.000Z'),
    async save() { this.updatedAt = new Date('2026-01-02T00:00:00.000Z'); return this; },
    toObject() { const c = { ...this }; delete c.save; return c; },
  };
  if (typeof data.save === 'function') doc.save = data.save.bind(doc);
  return doc;
}

function pngBuffer(size = 128) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const rest = Buffer.alloc(Math.max(0, size - sig.length), 0);
  return Buffer.concat([sig, rest]);
}
function jpegBuffer(size = 128) {
  const sig = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const rest = Buffer.alloc(Math.max(0, size - sig.length), 0);
  return Buffer.concat([sig, rest]);
}
function webpBuffer(size = 128) {
  const header = Buffer.from('RIFF');
  const sizeBuf = Buffer.alloc(4); sizeBuf.writeUInt32LE(Math.max(4, size - 8), 0);
  const webp = Buffer.from('WEBP');
  const rest = Buffer.alloc(Math.max(0, size - 12), 0);
  return Buffer.concat([header, sizeBuf, webp, rest]);
}
function textBuffer() { return Buffer.from('this is not an image'); }

function buildMultipart({ fields = {}, files = [] }) {
  const boundary = '----MessHuntBoundary' + Math.random().toString(16).slice(2);
  const chunks = [];
  const push = (s) => chunks.push(Buffer.isBuffer(s) ? s : Buffer.from(String(s)));
  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    push(`${value}\r\n`);
  }
  for (const file of files) {
    const filename = file.filename || 'upload.png';
    const contentType = file.contentType || 'image/png';
    const buf = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || '');
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${file.fieldName || 'photos'}"; filename="${filename}"\r\n`);
    push(`Content-Type: ${contentType}\r\n\r\n`);
    push(buf);
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  const body = Buffer.concat(chunks);
  return { boundary, body };
}

async function httpRequest(app, { method = 'GET', path = '/', body, headers = {}, multipart } = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  let payload = null;
  const reqHeaders = { ...headers };
  if (multipart) {
    const mp = buildMultipart(multipart);
    payload = mp.body;
    reqHeaders['Content-Type'] = `multipart/form-data; boundary=${mp.boundary}`;
    reqHeaders['Content-Length'] = payload.length;
  } else if (body !== undefined) {
    payload = Buffer.from(JSON.stringify(body));
    reqHeaders['Content-Type'] = 'application/json';
    reqHeaders['Content-Length'] = payload.length;
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

async function main() {
  const cloudinary = require('cloudinary').v2;
  const app = require('../src/app');
  const models = require('../src/models');

  console.log('Running Phase 4 Step 9/9.1 (Cloudinary Image Upload & Storage + Reliability Hardening) checks...\n');
  console.log('NOTE: Cloudinary SDK calls are MOCKED (no actual uploads/deletions). MongoDB/model operations are MOCKED/STUBBED (no live DB).\n');

  const ownerId = '65f300000000000000000001';
  const otherOwnerId = '65f300000000000000000002';
  const studentId = '65f100000000000000000001';
  const adminId = '65f500000000000000000001';
  const accId = '65f600000000000000000001';
  const photoSubId = '75f600000000000000000001';

  const origUploadStream = cloudinary.uploader.upload_stream;
  const origDestroy = cloudinary.uploader.destroy;

  function restoreCloudinaryMocks() {
    cloudinary.uploader.upload_stream = origUploadStream;
    cloudinary.uploader.destroy = origDestroy;
  }

  // 1) Unauthenticated upload is rejected
  try {
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos` });
    assert.strictEqual(res.status, 401);
    record('Unauthenticated upload is rejected', 'PASS', 'Missing token rejected before processing upload (HTTP/middleware flow)');
  } catch (err) { record('Unauthenticated upload is rejected', 'FAIL', err.message); }

  // 2) Student upload is rejected
  try {
    const restore = setModelStubs(models, { Student: { findById: async () => makeStudentDoc(studentId) }, Owner: { findById: async () => null }, Admin: { findById: async () => null } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` } });
    restore();
    assert.strictEqual(res.status, 403);
    record('Student upload is rejected', 'PASS', 'Student role cannot access owner upload endpoint');
  } catch (err) { record('Student upload is rejected', 'FAIL', err.message); }

  // 3) Owner can upload to their own accommodation
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    let saved = false;
    acc.save = async function () { saved = true; return this; };
    let uploadCalled = 0;
    cloudinary.uploader.upload_stream = (options, cb) => {
      uploadCalled++;
      const { Writable } = require('stream');
      return new Writable({ write(chunk, enc, done) { done(); }, final(done) { cb(null, { public_id: `mess-hunt/accommodations/test_${uploadCalled}`, secure_url: `https://res.cloudinary.com/test/image/upload/v1/test_${uploadCalled}.png`, format: 'png', width: 800, height: 600, resource_type: 'image', created_at: '2026-01-02T00:00:00.000Z' }); done(); } });
    };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'room.png', contentType: 'image/png', buffer: pngBuffer() }] } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 201);
    assert.ok(uploadCalled >= 1);
    assert.ok(saved);
    assert.strictEqual(res.body.data.photos.length, 1);
    assert.ok(res.body.data.photos[0].secureUrl);
    assert.ok(res.body.data.photos[0].publicId);
    assert.strictEqual(acc.photos.length, 1);
    record('Owner can upload to their own accommodation', 'PASS', 'Authenticated owning owner can upload valid image (mocked Cloudinary upload) and metadata saved (mocked MongoDB)');
  } catch (err) { restoreCloudinaryMocks(); record('Owner can upload to their own accommodation', 'FAIL', err.message); }

  // 4) Owner cannot upload to another owner's accommodation
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: otherOwnerId, photos: [] });
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'room.png', contentType: 'image/png', buffer: pngBuffer() }] } });
    restore();
    assert.strictEqual(res.status, 404);
    record('Owner cannot upload to another owner\'s accommodation', 'PASS', 'Ownership enforced; other owner accommodation not accessible');
  } catch (err) { record('Owner cannot upload to another owner\'s accommodation', 'FAIL', err.message); }

  // 5) Admin/unauthorized roles cannot use owner upload endpoints unless explicitly permitted
  try {
    const admin = makeAdminDoc(adminId);
    const restore = setModelStubs(models, { Admin: { findById: async () => admin }, Student: { findById: async () => null }, Owner: { findById: async () => null } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(adminId, 'admin')}` } });
    restore();
    assert.strictEqual(res.status, 403);
    record('Admin/unauthorized roles cannot use owner upload endpoints', 'PASS', 'Admin role denied on owner-only upload endpoint');
  } catch (err) { record('Admin/unauthorized roles cannot use owner upload endpoints', 'FAIL', err.message); }

  // 6) Unsupported file types are rejected
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    let uploadCalled = 0;
    cloudinary.uploader.upload_stream = () => { uploadCalled++; throw new Error('should not upload'); };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'note.txt', contentType: 'text/plain', buffer: textBuffer() }] } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(uploadCalled, 0);
    record('Unsupported file types are rejected', 'PASS', 'Non-image/invalid content rejected by MIME/content validation');
  } catch (err) { restoreCloudinaryMocks(); record('Unsupported file types are rejected', 'FAIL', err.message); }

  // 7) Oversized files are rejected
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    const big = jpegBuffer((5 * 1024 * 1024) + 1024); // > 5MB
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'big.jpg', contentType: 'image/jpeg', buffer: big }] } });
    restore();
    assert.strictEqual(res.status, 400);
    record('Oversized files are rejected', 'PASS', 'Files above configured size limit rejected');
  } catch (err) { record('Oversized files are rejected', 'FAIL', err.message); }

  // 8) Too many files are rejected
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: Array.from({ length: 9 }, (_, i) => ({ _id: `p${i}`, url: `u${i}`, publicId: `id${i}`, deletionStatus: 'active' })) });
    const files = [pngBuffer(), pngBuffer()]; // would make 11
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: files.map((b, i) => ({ fieldName: 'photos', filename: `r${i}.png`, contentType: 'image/png', buffer: b })) } });
    restore();
    assert.strictEqual(res.status, 400);
    record('Too many files are rejected', 'PASS', 'Per-accommodation active photo limit enforced');
  } catch (err) { record('Too many files are rejected', 'FAIL', err.message); }

  // 9) Invalid accommodation ID is rejected
  try {
    const owner = makeOwnerDoc(ownerId);
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/not-an-id/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    assert.strictEqual(res.status, 400);
    record('Invalid accommodation ID is rejected', 'PASS', 'Route validation rejects invalid accommodation ObjectId');
  } catch (err) { record('Invalid accommodation ID is rejected', 'FAIL', err.message); }

  // 10) Cloudinary upload failure is handled safely (partial upload: first succeeds, second fails)
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    let destroyCalls = 0;
    cloudinary.uploader.upload_stream = (options, cb) => {
      const call = (cloudinary.uploader.upload_stream.__count = (cloudinary.uploader.upload_stream.__count || 0) + 1);
      const { Writable } = require('stream');
      return new Writable({ write(c, e, d) { d(); }, final(done) { if (call === 1) cb(null, { public_id: 'mess-hunt/accommodations/partial1', secure_url: 'https://res.cloudinary.com/test/image/upload/v1/partial1.png', format: 'png', width: 1, height: 1, resource_type: 'image' }); else cb(new Error('cloudinary down')); done(); } });
    };
    cloudinary.uploader.destroy = async () => { destroyCalls++; return { result: 'ok' }; };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'a.png', contentType: 'image/png', buffer: pngBuffer() }, { fieldName: 'photos', filename: 'b.png', contentType: 'image/png', buffer: pngBuffer() }] } });
    restore();
    delete cloudinary.uploader.upload_stream.__count;
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(acc.photos.length, 0, 'No metadata should be saved on failed upload');
    assert.ok(destroyCalls >= 1, 'Cleanup attempted for partially uploaded asset (mocked Cloudinary)');
    record('Cloudinary upload failure is handled safely', 'PASS', 'Upload failure returns safe error, no DB metadata saved, cleanup attempted (mocked Cloudinary/DB)');
  } catch (err) { delete cloudinary.uploader.upload_stream.__count; restoreCloudinaryMocks(); record('Cloudinary upload failure is handled safely', 'FAIL', err.message); }

  // 11) Uploaded metadata is saved correctly
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    acc.save = async function () { return this; };
    cloudinary.uploader.upload_stream = (options, cb) => {
      const { Writable } = require('stream');
      return new Writable({ write(c, e, d) { d(); }, final(done) { cb(null, { public_id: 'mess-hunt/accommodations/meta1', secure_url: 'https://res.cloudinary.com/test/image/upload/v1/meta1.webp', format: 'webp', width: 640, height: 480, resource_type: 'image', created_at: '2026-01-03T00:00:00.000Z' }); done(); } });
    };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'room.webp', contentType: 'image/webp', buffer: webpBuffer() }] } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 201);
    const p = acc.photos[0];
    assert.strictEqual(p.publicId, 'mess-hunt/accommodations/meta1');
    assert.strictEqual(p.secureUrl, 'https://res.cloudinary.com/test/image/upload/v1/meta1.webp');
    assert.strictEqual(p.format, 'webp');
    assert.strictEqual(p.width, 640);
    assert.strictEqual(p.height, 480);
    record('Uploaded metadata is saved correctly', 'PASS', 'Secure URL, public ID, format, dimensions, timestamp stored (mocked Cloudinary/DB)');
  } catch (err) { restoreCloudinaryMocks(); record('Uploaded metadata is saved correctly', 'FAIL', err.message); }

  // 12) Owner can delete their own photo (two-stage deletion: mark pending -> cloud delete -> remove)
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [{ _id: photoSubId, url: 'https://res.cloudinary.com/test/image/upload/v1/a.png', secureUrl: 'https://res.cloudinary.com/test/image/upload/v1/a.png', publicId: 'mess-hunt/accommodations/a', format: 'png', width: 1, height: 1, filename: 'a.png', uploadedAt: new Date(), deletionStatus: 'active' }] });
    let saveCount = 0;
    acc.save = async function () { saveCount++; return this; };
    let destroyCalled = 0;
    cloudinary.uploader.destroy = async (publicId) => { destroyCalled++; assert.strictEqual(publicId, 'mess-hunt/accommodations/a'); return { result: 'ok' }; };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(destroyCalled, 1);
    assert.ok(saveCount >= 2, 'Two-stage deletion should persist pending state and final removal (mocked DB saves)');
    assert.strictEqual(getActivePhotoCount(acc.photos), 0);
    record('Owner can delete their own photo', 'PASS', 'Two-stage delete: pending saved, Cloudinary asset deleted (mocked), final DB metadata removed');
  } catch (err) { restoreCloudinaryMocks(); record('Owner can delete their own photo', 'FAIL', err.message); }

  // 13) Owner cannot delete another owner's photo
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: otherOwnerId, photos: [{ _id: photoSubId, publicId: 'mess-hunt/accommodations/other', secureUrl: 'x', url: 'x', deletionStatus: 'active' }] });
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    assert.strictEqual(res.status, 404);
    record('Owner cannot delete another owner\'s photo', 'PASS', 'Ownership enforced; cannot access/delete another owner\'s accommodation photo');
  } catch (err) { record('Owner cannot delete another owner\'s photo', 'FAIL', err.message); }

  // 14) Cloudinary deletion failure is handled safely (Step 9.1: photo restored to active state where possible)
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [{ _id: photoSubId, publicId: 'mess-hunt/accommodations/fail', secureUrl: 'x', url: 'x', deletionStatus: 'active' }] });
    let saveCount = 0;
    acc.save = async function () { saveCount++; return this; };
    cloudinary.uploader.destroy = async () => { throw new Error('cloudinary error'); };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(acc.photos.length, 1, 'Photo record should remain in DB');
    assert.strictEqual(acc.photos[0].deletionStatus, 'active', 'On Cloudinary failure, photo should be restored to active state (recoverable)');
    assert.ok(saveCount >= 2, 'Should save pending state then restore active state (mocked DB saves)');
    record('Cloudinary deletion failure is handled safely', 'PASS', 'Cloudinary delete failure returns 502; photo restored to active state via two-stage recovery (mocked Cloudinary/DB)');
  } catch (err) { restoreCloudinaryMocks(); record('Cloudinary deletion failure is handled safely', 'FAIL', err.message); }

  // 15) Arbitrary external URLs/public IDs cannot be injected through normal accommodation updates
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, status: 'pending', photos: [] });
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const createRes = await httpRequest(app, { method: 'POST', path: '/api/owners/accommodations', headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, body: { name: 'N', description: 'Valid description for create', accommodationType: 'Mess', genderType: 'Co-ed', location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'FA', landmark: '', googleMapsLink: 'https://maps.google.com/?q=x' }, pricing: { monthlyRent: 1000 }, roomDetails: { roomType: 'Shared', bathroomType: 'Shared' }, contact: { ownerDisplayName: 'O', contactNumber: '9999999' }, photos: [{ url: 'https://evil.example/x.jpg', publicId: 'other/folder/x' }] } });
    const updateRes = await httpRequest(app, { method: 'PATCH', path: `/api/owners/accommodations/${accId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, body: { photos: [{ url: 'https://evil.example/x.jpg', publicId: 'other/folder/x' }] } });
    restore();
    assert.strictEqual(createRes.status, 400);
    assert.strictEqual(updateRes.status, 400);
    record('Arbitrary external URLs/public IDs cannot be injected through normal accommodation updates', 'PASS', 'Create/update reject photos field; photos managed only via upload/delete endpoints');
  } catch (err) { record('Arbitrary external URLs/public IDs cannot be injected through normal accommodation updates', 'FAIL', err.message); }

  // 16) Public accommodation responses return safe photo URLs and metadata
  try {
    const publicDoc = { _id: accId, owner: '65f300000000000000000001', name: 'Approved Mess', description: 'desc', accommodationType: 'Mess', genderType: 'Co-ed', suitableFor: 'Students', location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'FA', landmark: '', googleMapsLink: 'https://maps.google.com/?q=x' }, pricing: { monthlyRent: 1000 }, roomDetails: { roomType: 'Shared', bathroomType: 'Shared' }, foodInfo: {}, facilities: [], rules: {}, availability: { status: 'Available', availableBeds: 1, availableFrom: null }, contact: { ownerDisplayName: 'O', contactNumber: '9999999' }, photos: [{ _id: photoSubId, url: 'https://res.cloudinary.com/test/image/upload/v1/safe.png', secureUrl: 'https://res.cloudinary.com/test/image/upload/v1/safe.png', publicId: 'mess-hunt/accommodations/safe', format: 'png', width: 100, height: 80, filename: 'safe.png', uploadedAt: new Date('2026-01-01T00:00:00.000Z'), deletionStatus: 'active' }], status: 'approved', isDemo: false, createdAt: new Date(), updatedAt: new Date(), toObject() { return { ...this }; } };
    const restore = setModelStubs(models, { Accommodation: { find: () => ({ sort: () => ({ skip: () => ({ limit: async () => [publicDoc] }) }) }), countDocuments: async () => 1 }, Review: { aggregate: async () => [] } });
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    restore();
    assert.strictEqual(res.status, 200);
    const photo = res.body.data.accommodations[0].photos[0];
    assert.ok(photo.secureUrl.includes('res.cloudinary.com'));
    assert.strictEqual(photo.publicId, 'mess-hunt/accommodations/safe');
    assert.ok(!('api_key' in photo));
    assert.ok(!('api_secret' in photo));
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('CLOUDINARY_API_SECRET'));
    record('Public accommodation responses return safe photo URLs and metadata', 'PASS', 'Public serializer returns safe photo metadata without secrets');
  } catch (err) { record('Public accommodation responses return safe photo URLs and metadata', 'FAIL', err.message); }

  // --- Step 9.1 required additions ---

  // 17) Three-file partial upload: first two uploads succeed, third fails; both earlier uploads must receive cleanup attempts
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    let uploadCount = 0;
    const destroyedIds = [];
    cloudinary.uploader.upload_stream = (options, cb) => {
      uploadCount++;
      const n = uploadCount;
      const { Writable } = require('stream');
      return new Writable({ write(c, e, d) { d(); }, final(done) { if (n <= 2) cb(null, { public_id: `mess-hunt/accommodations/p3_${n}`, secure_url: `https://res.cloudinary.com/test/image/upload/v1/p3_${n}.png`, format: 'png', width: 1, height: 1, resource_type: 'image' }); else cb(new Error('third upload failed')); done(); } });
    };
    cloudinary.uploader.destroy = async (publicId) => { destroyedIds.push(publicId); return { result: 'ok' }; };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [pngBuffer(), pngBuffer(), pngBuffer()].map((b, i) => ({ fieldName: 'photos', filename: `f${i + 1}.png`, contentType: 'image/png', buffer: b })) } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 502);
    assert.strictEqual(acc.photos.length, 0, 'No metadata should be saved when a later file fails');
    assert.ok(destroyedIds.includes('mess-hunt/accommodations/p3_1'), 'Cleanup attempted for first uploaded asset');
    assert.ok(destroyedIds.includes('mess-hunt/accommodations/p3_2'), 'Cleanup attempted for second uploaded asset');
    record('Three-file partial upload cleanup', 'PASS', 'First two uploads succeeded (mocked) and third failed; cleanup attempted for both earlier assets; no DB metadata saved');
  } catch (err) { restoreCloudinaryMocks(); record('Three-file partial upload cleanup', 'FAIL', err.message); }

  // 18) MongoDB save failure after successful Cloudinary upload; cleanup attempted for all uploaded assets
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    let saveAttempts = 0;
    acc.save = async function () { saveAttempts++; throw new Error('db save failed'); };
    let uploadCount = 0;
    const destroyedIds = [];
    cloudinary.uploader.upload_stream = (options, cb) => {
      uploadCount++;
      const n = uploadCount;
      const { Writable } = require('stream');
      return new Writable({ write(c, e, d) { d(); }, final(done) { cb(null, { public_id: `mess-hunt/accommodations/savefail_${n}`, secure_url: `https://res.cloudinary.com/test/image/upload/v1/savefail_${n}.png`, format: 'png', width: 1, height: 1, resource_type: 'image' }); done(); } });
    };
    cloudinary.uploader.destroy = async (publicId) => { destroyedIds.push(publicId); return { result: 'ok' }; };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [pngBuffer(), pngBuffer()].map((b, i) => ({ fieldName: 'photos', filename: `s${i + 1}.png`, contentType: 'image/png', buffer: b })) } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 502);
    assert.ok(uploadCount === 2, 'Both files uploaded to Cloudinary (mocked) before save failure');
    assert.ok(saveAttempts >= 1, 'DB save attempted and failed (mocked)');
    assert.ok(destroyedIds.includes('mess-hunt/accommodations/savefail_1') && destroyedIds.includes('mess-hunt/accommodations/savefail_2'), 'Cleanup attempted for all uploaded assets after DB save failure');
    record('MongoDB save failure after successful Cloudinary upload triggers cleanup', 'PASS', 'All uploaded Cloudinary assets received cleanup attempts after mocked DB save failure');
  } catch (err) { restoreCloudinaryMocks(); record('MongoDB save failure after successful Cloudinary upload triggers cleanup', 'FAIL', err.message); }

  // 19) Cloudinary deletion succeeds but the final MongoDB save fails; pending-deletion recovery state retained
  try {
    const owner = makeOwnerDoc(ownerId);
    const photo = { _id: photoSubId, url: 'https://res.cloudinary.com/test/image/upload/v1/x.png', secureUrl: 'https://res.cloudinary.com/test/image/upload/v1/x.png', publicId: 'mess-hunt/accommodations/finalsavefail', format: 'png', width: 1, height: 1, filename: 'x.png', uploadedAt: new Date(), deletionStatus: 'active', deletionRequestedAt: null, deletionError: '' };
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [photo] });
    let saveCount = 0;
    acc.save = async function () {
      saveCount++;
      if (saveCount === 1) return this; // mark pending_deletion persisted
      throw new Error('final db save failed'); // final removal save fails; DB remains at pending state in real DB
    };
    cloudinary.uploader.destroy = async () => ({ result: 'ok' });
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 500);
    assert.ok(saveCount >= 2, 'Pending-state save and final save attempted (mocked DB)');
    assert.strictEqual(photo.deletionStatus, 'pending_deletion', 'Photo remains in pending_deletion recovery state (not normal active/displayable)');
    assert.ok(res.body && /pending deletion/i.test(res.body.message || ''), 'Response explains pending-deletion recovery state');
    record('Cloudinary deletion succeeds but final MongoDB save fails retains pending-deletion state', 'PASS', 'Cloudinary delete confirmed (mocked) but final DB save failed (mocked); photo retained as pending_deletion and hidden from normal display');
  } catch (err) { restoreCloudinaryMocks(); record('Cloudinary deletion succeeds but final MongoDB save fails retains pending-deletion state', 'FAIL', err.message); }

  // 20) Cloudinary is not configured; upload and delete requests return safe 503 responses
  try {
    const restoreEnv = setEnv({ CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' });
    const owner = makeOwnerDoc(ownerId);
    const accUpload = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    const accDelete = makeAccommodationDoc({ _id: '65f600000000000000000099', owner: ownerId, photos: [{ _id: photoSubId, publicId: 'mess-hunt/accommodations/needs-cloud', secureUrl: 'x', url: 'x', deletionStatus: 'active' }] });
    const restore = setModelStubs(models, {
      Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null },
      Accommodation: { findById: async (id) => (String(id) === accId ? accUpload : String(id) === '65f600000000000000000099' ? accDelete : null) },
    });
    const uploadRes = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [{ fieldName: 'photos', filename: 'room.png', contentType: 'image/png', buffer: pngBuffer() }] } });
    const deleteRes = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/65f600000000000000000099/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    restoreEnv();
    assert.strictEqual(uploadRes.status, 503, 'Upload should fail safely when Cloudinary not configured');
    assert.strictEqual(deleteRes.status, 503, 'Delete of Cloudinary-managed photo should fail safely when Cloudinary not configured');
    record('Cloudinary not configured returns safe 503 for upload and delete', 'PASS', 'Missing Cloudinary config returns safe 503 for upload and Cloudinary-managed delete (no credentials exposed)');
  } catch (err) { restoreCloudinaryMocks(); record('Cloudinary not configured returns safe 503 for upload and delete', 'FAIL', err.message); }

  // 21) Unauthenticated photo deletion is rejected
  try {
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}` });
    assert.strictEqual(res.status, 401);
    record('Unauthenticated photo deletion is rejected', 'PASS', 'Missing token rejected on delete endpoint');
  } catch (err) { record('Unauthenticated photo deletion is rejected', 'FAIL', err.message); }

  // 22) Student photo deletion is rejected
  try {
    const restore = setModelStubs(models, { Student: { findById: async () => makeStudentDoc(studentId) }, Owner: { findById: async () => null }, Admin: { findById: async () => null } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(studentId, 'student')}` } });
    restore();
    assert.strictEqual(res.status, 403);
    record('Student photo deletion is rejected', 'PASS', 'Student role denied on owner-only delete endpoint');
  } catch (err) { record('Student photo deletion is rejected', 'FAIL', err.message); }

  // 23) Admin photo deletion is rejected
  try {
    const restore = setModelStubs(models, { Admin: { findById: async () => makeAdminDoc(adminId) }, Owner: { findById: async () => null }, Student: { findById: async () => null } });
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/${photoSubId}`, headers: { Authorization: `Bearer ${makeToken(adminId, 'admin')}` } });
    restore();
    assert.strictEqual(res.status, 403);
    record('Admin photo deletion is rejected', 'PASS', 'Admin role denied on owner-only delete endpoint');
  } catch (err) { record('Admin photo deletion is rejected', 'FAIL', err.message); }

  // 24) Empty upload request is rejected safely
  try {
    const owner = makeOwnerDoc(ownerId);
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [] });
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    // multipart request with no files
    const res = await httpRequest(app, { method: 'POST', path: `/api/owners/accommodations/${accId}/photos`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` }, multipart: { files: [] } });
    restore();
    assert.strictEqual(res.status, 400);
    record('Empty upload request is rejected safely', 'PASS', 'Request with no image files rejected with validation error');
  } catch (err) { record('Empty upload request is rejected safely', 'FAIL', err.message); }

  // 25) Legacy photo records without subdocument IDs or Cloudinary public IDs are handled safely
  try {
    const owner = makeOwnerDoc(ownerId);
    // Legacy photo: no _id, no publicId, no deletionStatus
    const legacyPhoto = { url: '/uploads/legacy.jpg', secureUrl: '/uploads/legacy.jpg', filename: 'legacy.jpg' };
    const acc = makeAccommodationDoc({ _id: accId, owner: ownerId, photos: [legacyPhoto] });
    let saveCount = 0;
    acc.save = async function () { saveCount++; return this; };
    let destroyCalled = 0;
    cloudinary.uploader.destroy = async () => { destroyCalled++; return { result: 'ok' }; };
    const restore = setModelStubs(models, { Owner: { findById: async () => owner }, Student: { findById: async () => null }, Admin: { findById: async () => null }, Accommodation: { findById: async () => acc } });
    // No subdocument id to target via URL; endpoint should respond safely (404) rather than unintended deletion
    const res = await httpRequest(app, { method: 'DELETE', path: `/api/owners/accommodations/${accId}/photos/legacy-no-id`, headers: { Authorization: `Bearer ${makeToken(ownerId, 'owner')}` } });
    restore();
    restoreCloudinaryMocks();
    assert.strictEqual(res.status, 404, 'Legacy photo without stable id/reference should not be matched/deleted by arbitrary id');
    assert.strictEqual(destroyCalled, 0, 'No Cloudinary deletion attempted for unmatched legacy record');
    assert.strictEqual(acc.photos.length, 1, 'Legacy photo remains intact when not safely matched');
    // Also verify legacy photo is safely serialized in public response
    const publicDoc = { _id: accId, owner: ownerId, name: 'Mess', description: 'd', accommodationType: 'Mess', genderType: 'Co-ed', suitableFor: '', location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'A', landmark: '', googleMapsLink: 'https://maps.google.com/?q=x' }, pricing: { monthlyRent: 1 }, roomDetails: { roomType: 'Shared', bathroomType: 'Shared' }, foodInfo: {}, facilities: [], rules: {}, availability: { status: 'Available', availableBeds: 1, availableFrom: null }, contact: { ownerDisplayName: 'O', contactNumber: '9999999' }, photos: [legacyPhoto], status: 'approved', isDemo: false, createdAt: new Date(), updatedAt: new Date(), toObject() { return { ...this }; } };
    const restore2 = setModelStubs(models, { Accommodation: { find: () => ({ sort: () => ({ skip: () => ({ limit: async () => [publicDoc] }) }) }), countDocuments: async () => 1 }, Review: { aggregate: async () => [] } });
    const pubRes = await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    restore2();
    assert.strictEqual(pubRes.status, 200);
    assert.strictEqual(pubRes.body.data.accommodations[0].photos.length, 1);
    assert.ok(pubRes.body.data.accommodations[0].photos[0].url || pubRes.body.data.accommodations[0].photos[0].secureUrl);
    record('Legacy photo records without subdocument IDs or Cloudinary public IDs are handled safely', 'PASS', 'Legacy records not unintentionally deleted/mis-matched; safe serialization preserved (mocked DB)');
  } catch (err) { restoreCloudinaryMocks(); record('Legacy photo records without subdocument IDs or Cloudinary public IDs are handled safely', 'FAIL', err.message); }

  // 26) Pending-deletion photos are excluded from public photo serialization
  try {
    const publicDoc = {
      _id: accId, owner: ownerId, name: 'Mess', description: 'd', accommodationType: 'Mess', genderType: 'Co-ed', suitableFor: '', location: { state: 'S', district: 'D', city: 'C', locality: 'L', fullAddress: 'A', landmark: '', googleMapsLink: 'https://maps.google.com/?q=x' }, pricing: { monthlyRent: 1 }, roomDetails: { roomType: 'Shared', bathroomType: 'Shared' }, foodInfo: {}, facilities: [], rules: {}, availability: { status: 'Available', availableBeds: 1, availableFrom: null }, contact: { ownerDisplayName: 'O', contactNumber: '9999999' },
      photos: [
        { _id: '75f6000000000000000000a1', publicId: 'mess-hunt/accommodations/active1', secureUrl: 'https://res.cloudinary.com/test/image/upload/v1/active1.png', url: 'https://res.cloudinary.com/test/image/upload/v1/active1.png', deletionStatus: 'active' },
        { _id: '75f6000000000000000000a2', publicId: 'mess-hunt/accommodations/pending1', secureUrl: 'https://res.cloudinary.com/test/image/upload/v1/pending1.png', url: 'https://res.cloudinary.com/test/image/upload/v1/pending1.png', deletionStatus: 'pending_deletion', deletionRequestedAt: new Date() },
      ],
      status: 'approved', isDemo: false, createdAt: new Date(), updatedAt: new Date(), toObject() { return { ...this }; }
    };
    const restore = setModelStubs(models, { Accommodation: { find: () => ({ sort: () => ({ skip: () => ({ limit: async () => [publicDoc] }) }) }), countDocuments: async () => 1 }, Review: { aggregate: async () => [] } });
    const res = await httpRequest(app, { method: 'GET', path: '/api/accommodations' });
    restore();
    assert.strictEqual(res.status, 200);
    const photos = res.body.data.accommodations[0].photos;
    assert.strictEqual(photos.length, 1, 'Pending-deletion photo must be excluded from normal public display');
    assert.strictEqual(photos[0].publicId, 'mess-hunt/accommodations/active1');
    const bodyStr = JSON.stringify(res.body);
    assert.ok(!bodyStr.includes('pending1'), 'Pending-deletion photo data must not appear in public response');
    record('Pending-deletion photos are excluded from public photo serialization', 'PASS', 'Public responses expose only active/displayable photos; pending-deletion records hidden');
  } catch (err) { record('Pending-deletion photos are excluded from public photo serialization', 'FAIL', err.message); }

  // 27) Blocked: actual Cloudinary uploads/deletions
  record('Actual Cloudinary upload/delete (live credentials)', 'BLOCKED', 'No real Cloudinary credentials configured; Cloudinary SDK calls were mocked and MongoDB operations stubbed');

  console.log('\nSummary:');
  const summary = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(JSON.stringify({ total: results.length, summary, results }, null, 2));
  if (summary.FAIL) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
