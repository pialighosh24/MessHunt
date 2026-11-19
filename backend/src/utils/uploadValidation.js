const crypto = require('crypto');
const ApiError = require('./ApiError');

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function getFileExtension(filename = '') {
  const lower = String(filename || '').toLowerCase();
  const idx = lower.lastIndexOf('.');
  return idx >= 0 ? lower.slice(idx) : '';
}

function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return 'png';
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return 'webp';
  return null;
}

function mimeMatchesDetectedType(mime, detectedType) {
  if (!mime || !detectedType) return false;
  const m = String(mime).toLowerCase();
  if (detectedType === 'jpeg') return m === 'image/jpeg' || m === 'image/jpg';
  if (detectedType === 'png') return m === 'image/png';
  if (detectedType === 'webp') return m === 'image/webp';
  return false;
}

function validateImageFile(file, { index, maxSizeBytes }) {
  if (!file) {
    throw new ApiError(400, 'Validation failed', [{ field: `photos[${index}]`, message: 'Invalid file upload' }]);
  }
  const errors = [];
  const ext = getFileExtension(file.originalname);
  if (file.size <= 0) errors.push({ field: `photos[${index}]`, message: 'File is empty' });
  if (maxSizeBytes && file.size > maxSizeBytes) {
    errors.push({ field: `photos[${index}]`, message: `File exceeds maximum size of ${Math.round(maxSizeBytes / (1024 * 1024))} MB` });
  }
  const mime = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
    errors.push({ field: `photos[${index}]`, message: 'Unsupported file type. Only JPEG, PNG, and WebP images are allowed' });
  }
  if (ext && !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    errors.push({ field: `photos[${index}]`, message: 'Unsupported file extension. Only .jpg, .jpeg, .png, and .webp are allowed' });
  }
  const detectedType = detectImageType(file.buffer);
  if (!detectedType) {
    errors.push({ field: `photos[${index}]`, message: 'File content is not a valid JPEG, PNG, or WebP image' });
  } else if (!mimeMatchesDetectedType(mime, detectedType)) {
    errors.push({ field: `photos[${index}]`, message: 'File content does not match the declared image type' });
  }

  if (errors.length) throw new ApiError(400, 'Image validation failed', errors);
  return { detectedType };
}

function generateSafePublicIdPrefix(accommodationId) {
  const rand = crypto.randomBytes(6).toString('hex');
  const ts = Date.now();
  return `${String(accommodationId)}_${ts}_${rand}`;
}

function isPhotoPendingDeletion(photoDocOrObj) {
  const p = photoDocOrObj && typeof photoDocOrObj.toObject === 'function' ? photoDocOrObj.toObject() : (photoDocOrObj || {});
  // Legacy records without deletionStatus are treated as active.
  return p.deletionStatus === 'pending_deletion';
}

function toSafePhotoMetadata({ photoDocOrObj, accommodationId }) {
  const p = photoDocOrObj && typeof photoDocOrObj.toObject === 'function' ? photoDocOrObj.toObject() : (photoDocOrObj || {});
  const secureUrl = p.secureUrl || p.url || '';
  return {
    id: p._id ? String(p._id) : undefined,
    url: secureUrl || (p.url || ''),
    secureUrl: secureUrl || (p.url || ''),
    publicId: p.publicId || '',
    format: p.format || '',
    width: p.width ?? null,
    height: p.height ?? null,
    filename: p.filename || '',
    uploadedAt: p.uploadedAt || null,
  };
}

function sanitizePhotoArrayForResponse(photos, accommodationId, options = {}) {
  const { includePendingDeletion = false } = options || {};
  return (Array.isArray(photos) ? photos : [])
    .filter((p) => includePendingDeletion || !isPhotoPendingDeletion(p))
    .map((p) => toSafePhotoMetadata({ photoDocOrObj: p, accommodationId }));
}

module.exports = {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  detectImageType,
  validateImageFile,
  generateSafePublicIdPrefix,
  isPhotoPendingDeletion,
  toSafePhotoMetadata,
  sanitizePhotoArrayForResponse,
};
