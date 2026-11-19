const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  BATHROOM_TYPES,
  AVAILABILITY_STATUS,
} = require('../../utils/constants');
const { isValidUrl, isValidObjectId } = require('../../utils/validators');
const {
  validateImageFile,
  sanitizePhotoArrayForResponse,
  isPhotoPendingDeletion,
} = require('../../utils/uploadValidation');
const { getCollections, withWriteLock } = require('../store');
const { newId, sameId } = require('../ids');
const { getAccommodationUploadsDir, getMaxUploadSizeMb, getMaxPhotosPerAccommodation } = require('../config');
const { nowIso } = require('../utils/storeHelpers');

const PROTECTED_FIELDS = new Set(['owner', 'status', 'rejectionReason', 'isDemo', '_id', 'id', 'createdAt', 'updatedAt', '__v']);
const ALLOWED_TOP_LEVEL_FIELDS = new Set(['name', 'description', 'accommodationType', 'genderType', 'suitableFor', 'location', 'pricing', 'roomDetails', 'foodInfo', 'facilities', 'rules', 'availability', 'contact']);
const LOCATION_FIELDS = ['state', 'district', 'city', 'locality', 'fullAddress', 'landmark', 'googleMapsLink'];
const PRICING_FIELDS = ['monthlyRent', 'securityDeposit', 'electricityCharges', 'waterCharges', 'foodCharges', 'otherCharges', 'includedChargesInfo', 'extraChargesInfo'];
const ROOM_FIELDS = ['roomType', 'totalRooms', 'availableRoomsOrBeds', 'bathroomType', 'furnishing'];
const FOOD_FIELDS = ['foodProvided', 'selfCookingAllowed', 'homeFoodDeliveryAllowed'];
const RULE_FIELDS = ['entryTiming', 'visitorRules', 'additionalRules'];
const AVAILABILITY_FIELDS = ['status', 'availableBeds', 'availableFrom'];
const CONTACT_FIELDS = ['ownerDisplayName', 'contactNumber'];

function pushError(errors, field, message) { errors.push({ field, message }); }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function asTrimmedString(value) { return typeof value === 'string' ? value.trim() : value; }

function validateStringField(errors, value, field, { required = false, min = 0, max = Infinity, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null || value === '') {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') { pushError(errors, field, `${name} must be a string`); return undefined; }
  const trimmed = value.trim();
  if (required && !trimmed) pushError(errors, field, `${name} is required`);
  if (trimmed && trimmed.length < min) pushError(errors, field, `${name} must be at least ${min} characters`);
  if (trimmed && trimmed.length > max) pushError(errors, field, `${name} must be at most ${max} characters`);
  return trimmed;
}

function validateEnumField(errors, value, field, allowed, { required = false, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null || value === '') {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  if (!allowed.includes(value)) { pushError(errors, field, `${name} must be one of: ${allowed.join(', ')}`); return undefined; }
  return value;
}

function validateNonNegativeNumber(errors, value, field, { required = false, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null || value === '') {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) { pushError(errors, field, `${name} must be a non-negative number`); return undefined; }
  return num;
}

function validateBooleanField(errors, value, field, { required = false, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null) { if (required) pushError(errors, field, `${name} is required`); return undefined; }
  if (typeof value !== 'boolean') { pushError(errors, field, `${name} must be true or false`); return undefined; }
  return value;
}

function validateLocation(location, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(location)) { pushError(errors, 'location', 'Location information is required'); return undefined; }
  if (location === undefined) return undefined;
  if (!isPlainObject(location)) { pushError(errors, 'location', 'Location must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(location)) if (!LOCATION_FIELDS.includes(key)) pushError(errors, `location.${key}`, `location.${key} is not allowed`);
  const required = !partial;
  out.state = validateStringField(errors, location.state, 'location.state', { required, max: 100, label: 'State' });
  out.district = validateStringField(errors, location.district, 'location.district', { required, max: 100, label: 'District' });
  out.city = validateStringField(errors, location.city, 'location.city', { required, max: 100, label: 'City' });
  out.locality = validateStringField(errors, location.locality, 'location.locality', { required, max: 100, label: 'Locality' });
  out.fullAddress = validateStringField(errors, location.fullAddress, 'location.fullAddress', { required, max: 500, label: 'Full address' });
  out.landmark = validateStringField(errors, location.landmark, 'location.landmark', { required: false, max: 200, label: 'Landmark' });
  if (location.googleMapsLink !== undefined) {
    const link = asTrimmedString(location.googleMapsLink);
    if (required && !link) pushError(errors, 'location.googleMapsLink', 'Google Maps link is required');
    else if (link) { if (!isValidUrl(link)) pushError(errors, 'location.googleMapsLink', 'Please provide a valid Google Maps URL'); else out.googleMapsLink = link; }
    else if (!required) out.googleMapsLink = '';
  } else if (required) pushError(errors, 'location.googleMapsLink', 'Google Maps link is required');
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validatePricing(pricing, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(pricing)) { pushError(errors, 'pricing', 'Pricing information is required'); return undefined; }
  if (pricing === undefined) return undefined;
  if (!isPlainObject(pricing)) { pushError(errors, 'pricing', 'Pricing must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(pricing)) if (!PRICING_FIELDS.includes(key)) pushError(errors, `pricing.${key}`, `pricing.${key} is not allowed`);
  out.monthlyRent = validateNonNegativeNumber(errors, pricing.monthlyRent, 'pricing.monthlyRent', { required: !partial, label: 'Monthly rent' });
  out.securityDeposit = validateNonNegativeNumber(errors, pricing.securityDeposit, 'pricing.securityDeposit', { required: false, label: 'Security deposit' });
  out.electricityCharges = validateNonNegativeNumber(errors, pricing.electricityCharges, 'pricing.electricityCharges', { required: false, label: 'Electricity charges' });
  out.waterCharges = validateNonNegativeNumber(errors, pricing.waterCharges, 'pricing.waterCharges', { required: false, label: 'Water charges' });
  out.foodCharges = validateNonNegativeNumber(errors, pricing.foodCharges, 'pricing.foodCharges', { required: false, label: 'Food charges' });
  out.otherCharges = validateNonNegativeNumber(errors, pricing.otherCharges, 'pricing.otherCharges', { required: false, label: 'Other charges' });
  out.includedChargesInfo = validateStringField(errors, pricing.includedChargesInfo, 'pricing.includedChargesInfo', { required: false, max: 500, label: 'Included charges info' });
  out.extraChargesInfo = validateStringField(errors, pricing.extraChargesInfo, 'pricing.extraChargesInfo', { required: false, max: 500, label: 'Extra charges info' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateRoomDetails(roomDetails, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(roomDetails)) { pushError(errors, 'roomDetails', 'Room details are required'); return undefined; }
  if (roomDetails === undefined) return undefined;
  if (!isPlainObject(roomDetails)) { pushError(errors, 'roomDetails', 'Room details must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(roomDetails)) if (!ROOM_FIELDS.includes(key)) pushError(errors, `roomDetails.${key}`, `roomDetails.${key} is not allowed`);
  out.roomType = validateEnumField(errors, roomDetails.roomType, 'roomDetails.roomType', ROOM_TYPES, { required: !partial, label: 'Room type' });
  out.totalRooms = validateNonNegativeNumber(errors, roomDetails.totalRooms, 'roomDetails.totalRooms', { required: false, label: 'Total rooms' });
  out.availableRoomsOrBeds = validateNonNegativeNumber(errors, roomDetails.availableRoomsOrBeds, 'roomDetails.availableRoomsOrBeds', { required: false, label: 'Available rooms/beds' });
  out.bathroomType = validateEnumField(errors, roomDetails.bathroomType, 'roomDetails.bathroomType', BATHROOM_TYPES, { required: !partial, label: 'Bathroom type' });
  out.furnishing = validateStringField(errors, roomDetails.furnishing, 'roomDetails.furnishing', { required: false, max: 500, label: 'Furnishing' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateFoodInfo(foodInfo, errors) {
  if (foodInfo === undefined) return undefined;
  if (!isPlainObject(foodInfo)) { pushError(errors, 'foodInfo', 'Food information must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(foodInfo)) if (!FOOD_FIELDS.includes(key)) pushError(errors, `foodInfo.${key}`, `foodInfo.${key} is not allowed`);
  out.foodProvided = validateBooleanField(errors, foodInfo.foodProvided, 'foodInfo.foodProvided', { required: false, label: 'Food provided' });
  out.selfCookingAllowed = validateBooleanField(errors, foodInfo.selfCookingAllowed, 'foodInfo.selfCookingAllowed', { required: false, label: 'Self-cooking allowed' });
  out.homeFoodDeliveryAllowed = validateBooleanField(errors, foodInfo.homeFoodDeliveryAllowed, 'foodInfo.homeFoodDeliveryAllowed', { required: false, label: 'Home food delivery allowed' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateRules(rules, errors) {
  if (rules === undefined) return undefined;
  if (!isPlainObject(rules)) { pushError(errors, 'rules', 'Rules must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(rules)) if (!RULE_FIELDS.includes(key)) pushError(errors, `rules.${key}`, `rules.${key} is not allowed`);
  out.entryTiming = validateStringField(errors, rules.entryTiming, 'rules.entryTiming', { required: false, max: 200, label: 'Entry timing' });
  out.visitorRules = validateStringField(errors, rules.visitorRules, 'rules.visitorRules', { required: false, max: 500, label: 'Visitor rules' });
  out.additionalRules = validateStringField(errors, rules.additionalRules, 'rules.additionalRules', { required: false, max: 1000, label: 'Additional rules' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateAvailability(availability, errors) {
  if (availability === undefined) return undefined;
  if (!isPlainObject(availability)) { pushError(errors, 'availability', 'Availability must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(availability)) if (!AVAILABILITY_FIELDS.includes(key)) pushError(errors, `availability.${key}`, `availability.${key} is not allowed`);
  out.status = validateEnumField(errors, availability.status, 'availability.status', AVAILABILITY_STATUS, { required: false, label: 'Availability status' });
  out.availableBeds = validateNonNegativeNumber(errors, availability.availableBeds, 'availability.availableBeds', { required: false, label: 'Available beds' });
  if (availability.availableFrom !== undefined) {
    if (availability.availableFrom === null || availability.availableFrom === '') out.availableFrom = null;
    else {
      const d = new Date(availability.availableFrom);
      if (Number.isNaN(d.getTime())) pushError(errors, 'availability.availableFrom', 'Available from must be a valid date');
      else out.availableFrom = d.toISOString();
    }
  }
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateContact(contact, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(contact)) { pushError(errors, 'contact', 'Contact information is required'); return undefined; }
  if (contact === undefined) return undefined;
  if (!isPlainObject(contact)) { pushError(errors, 'contact', 'Contact information must be an object'); return undefined; }
  const out = {};
  for (const key of Object.keys(contact)) if (!CONTACT_FIELDS.includes(key)) pushError(errors, `contact.${key}`, `contact.${key} is not allowed`);
  out.ownerDisplayName = validateStringField(errors, contact.ownerDisplayName, 'contact.ownerDisplayName', { required: !partial, max: 100, label: 'Owner display name' });
  out.contactNumber = validateStringField(errors, contact.contactNumber, 'contact.contactNumber', { required: !partial, min: 7, max: 20, label: 'Contact number' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateFacilities(facilities, errors) {
  if (facilities === undefined) return undefined;
  if (!Array.isArray(facilities)) { pushError(errors, 'facilities', 'Facilities must be an array of strings'); return undefined; }
  const cleaned = [];
  facilities.forEach((item, idx) => {
    if (typeof item !== 'string' || !item.trim()) pushError(errors, `facilities[${idx}]`, 'Each facility must be a non-empty string');
    else cleaned.push(item.trim());
  });
  return cleaned;
}

function validateCreatePayload(body = {}) {
  const errors = [];
  if (!isPlainObject(body)) throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'Request body must be an object' }]);
  for (const key of Object.keys(body)) {
    if (PROTECTED_FIELDS.has(key)) pushError(errors, key, `${key} cannot be set by owner`);
    else if (key === 'photos') pushError(errors, 'photos', 'Photos cannot be set via this endpoint. Use the photo upload endpoint.');
    else if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) pushError(errors, key, `${key} is not allowed`);
  }
  const data = {};
  data.name = validateStringField(errors, body.name, 'name', { required: true, min: 2, max: 150, label: 'Accommodation name' });
  data.description = validateStringField(errors, body.description, 'description', { required: true, min: 10, max: 3000, label: 'Description' });
  data.accommodationType = validateEnumField(errors, body.accommodationType, 'accommodationType', ACCOMMODATION_TYPES, { required: true, label: 'Accommodation type' });
  data.genderType = validateEnumField(errors, body.genderType, 'genderType', GENDER_TYPES, { required: true, label: 'Gender type' });
  data.suitableFor = validateStringField(errors, body.suitableFor, 'suitableFor', { required: false, max: 200, label: 'Suitable occupants' }) || '';
  data.location = validateLocation(body.location, errors, { partial: false });
  data.pricing = validatePricing(body.pricing, errors, { partial: false });
  data.roomDetails = validateRoomDetails(body.roomDetails, errors, { partial: false });
  data.foodInfo = validateFoodInfo(body.foodInfo, errors) || { foodProvided: false, selfCookingAllowed: false, homeFoodDeliveryAllowed: false };
  data.facilities = validateFacilities(body.facilities, errors) || [];
  data.rules = validateRules(body.rules, errors) || { entryTiming: '', visitorRules: '', additionalRules: '' };
  data.availability = validateAvailability(body.availability, errors) || { status: AVAILABILITY_STATUS.AVAILABLE, availableBeds: 0, availableFrom: null };
  data.contact = validateContact(body.contact, errors, { partial: false });
  data.photos = [];
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  return data;
}

function validateUpdatePayload(body = {}) {
  const errors = [];
  if (!isPlainObject(body)) throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'Request body must be an object' }]);
  const keys = Object.keys(body);
  if (keys.length === 0) throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'At least one field is required for update' }]);
  for (const key of keys) {
    if (PROTECTED_FIELDS.has(key)) pushError(errors, key, `${key} cannot be modified by owner`);
    else if (key === 'photos') pushError(errors, 'photos', 'Photos cannot be modified via this endpoint. Use the photo upload and delete endpoints.');
    else if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) pushError(errors, key, `${key} is not allowed`);
  }
  const data = {};
  if (Object.prototype.hasOwnProperty.call(body, 'name')) data.name = validateStringField(errors, body.name, 'name', { required: true, min: 2, max: 150, label: 'Accommodation name' });
  if (Object.prototype.hasOwnProperty.call(body, 'description')) data.description = validateStringField(errors, body.description, 'description', { required: true, min: 10, max: 3000, label: 'Description' });
  if (Object.prototype.hasOwnProperty.call(body, 'accommodationType')) data.accommodationType = validateEnumField(errors, body.accommodationType, 'accommodationType', ACCOMMODATION_TYPES, { required: true, label: 'Accommodation type' });
  if (Object.prototype.hasOwnProperty.call(body, 'genderType')) data.genderType = validateEnumField(errors, body.genderType, 'genderType', GENDER_TYPES, { required: true, label: 'Gender type' });
  if (Object.prototype.hasOwnProperty.call(body, 'suitableFor')) data.suitableFor = validateStringField(errors, body.suitableFor, 'suitableFor', { required: false, max: 200, label: 'Suitable occupants' }) || '';
  if (Object.prototype.hasOwnProperty.call(body, 'location')) data.location = validateLocation(body.location, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'pricing')) data.pricing = validatePricing(body.pricing, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'roomDetails')) data.roomDetails = validateRoomDetails(body.roomDetails, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'foodInfo')) data.foodInfo = validateFoodInfo(body.foodInfo, errors);
  if (Object.prototype.hasOwnProperty.call(body, 'facilities')) data.facilities = validateFacilities(body.facilities, errors);
  if (Object.prototype.hasOwnProperty.call(body, 'rules')) data.rules = validateRules(body.rules, errors);
  if (Object.prototype.hasOwnProperty.call(body, 'availability')) data.availability = validateAvailability(body.availability, errors);
  if (Object.prototype.hasOwnProperty.call(body, 'contact')) data.contact = validateContact(body.contact, errors, { partial: true });
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (Object.keys(data).length === 0) throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'No valid updatable fields provided' }]);
  return data;
}

function mergeNested(existing = {}, updates = {}) { return { ...(existing && typeof existing === 'object' ? existing : {}), ...updates }; }

function applyAccommodationUpdates(accommodation, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (['location', 'pricing', 'roomDetails', 'foodInfo', 'rules', 'availability', 'contact'].includes(key)) {
      accommodation[key] = mergeNested(accommodation[key], value);
    } else {
      accommodation[key] = value;
    }
  }
}

function isSubstantiveUpdateForReview(updates) {
  const substantiveKeys = ['name','description','accommodationType','genderType','suitableFor','location','pricing','roomDetails','foodInfo','facilities','rules','availability','contact','photos'];
  return substantiveKeys.some((k) => Object.prototype.hasOwnProperty.call(updates, k));
}

function toOwnerAccommodationResponse(accommodation) {
  return {
    id: String(accommodation._id),
    owner: String(accommodation.owner),
    name: accommodation.name,
    description: accommodation.description,
    accommodationType: accommodation.accommodationType,
    genderType: accommodation.genderType,
    suitableFor: accommodation.suitableFor || '',
    location: accommodation.location || {},
    pricing: accommodation.pricing || {},
    roomDetails: accommodation.roomDetails || {},
    foodInfo: accommodation.foodInfo || {},
    facilities: Array.isArray(accommodation.facilities) ? accommodation.facilities : [],
    rules: accommodation.rules || {},
    availability: accommodation.availability || {},
    contact: accommodation.contact || {},
    photos: sanitizePhotoArrayForResponse(accommodation.photos, accommodation._id),
    status: accommodation.status,
    rejectionReason: accommodation.rejectionReason || '',
    isDemo: Boolean(accommodation.isDemo),
    createdAt: accommodation.createdAt,
    updatedAt: accommodation.updatedAt,
  };
}

function findOwnedAccommodationOr404(accommodationId, ownerId) {
  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');
  const { accommodations } = getCollections();
  const accommodation = accommodations.find((a) => sameId(a._id, accommodationId));
  if (!accommodation || !sameId(accommodation.owner, ownerId)) {
    throw new ApiError(404, 'Accommodation not found');
  }
  return accommodation;
}

const createAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const data = validateCreatePayload(req.body);
  const ts = nowIso();
  let created;

  await withWriteLock(async (state) => {
    created = {
      _id: newId(),
      owner: String(ownerId),
      ...data,
      status: ACCOMMODATION_STATUS.PENDING,
      rejectionReason: '',
      isDemo: false,
      createdAt: ts,
      updatedAt: ts,
    };
    // ensure defaults
    if (!created.availability) created.availability = { status: AVAILABILITY_STATUS.AVAILABLE, availableBeds: 0, availableFrom: null };
    if (!created.foodInfo) created.foodInfo = { foodProvided: false, selfCookingAllowed: false, homeFoodDeliveryAllowed: false };
    state.accommodations.push(created);
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Accommodation created successfully and submitted for review',
    data: { accommodation: toOwnerAccommodationResponse(created) },
  });
});

const getMyAccommodations = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const { accommodations } = getCollections();
  const mine = accommodations
    .filter((a) => sameId(a.owner, ownerId))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Owner accommodations retrieved successfully',
    data: { accommodations: mine.map(toOwnerAccommodationResponse), count: mine.length },
  });
});

const getMyAccommodationById = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodation = findOwnedAccommodationOr404(req.params.id, ownerId);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation retrieved successfully',
    data: { accommodation: toOwnerAccommodationResponse(accommodation) },
  });
});

const updateMyAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const updates = validateUpdatePayload(req.body);

  let updatedResult;
  let meta = {};
  await withWriteLock(async (state) => {
    const accommodation = state.accommodations.find((a) => sameId(a._id, req.params.id));
    if (!accommodation || !sameId(accommodation.owner, ownerId)) throw new ApiError(404, 'Accommodation not found');

    const wasApproved = accommodation.status === ACCOMMODATION_STATUS.APPROVED;
    const wasRejected = accommodation.status === ACCOMMODATION_STATUS.REJECTED;

    applyAccommodationUpdates(accommodation, updates);

    // Safe resubmission/re-review workflow
    if (wasApproved && isSubstantiveUpdateForReview(updates)) {
      accommodation.status = ACCOMMODATION_STATUS.PENDING;
      accommodation.rejectionReason = '';
      meta = { previousStatus: ACCOMMODATION_STATUS.APPROVED, reReviewRequired: true };
    } else if (wasRejected && isSubstantiveUpdateForReview(updates)) {
      accommodation.status = ACCOMMODATION_STATUS.PENDING;
      accommodation.rejectionReason = '';
      meta = { previousStatus: ACCOMMODATION_STATUS.REJECTED, resubmittedForReview: true };
    } else {
      meta = { previousStatus: accommodation.status, reReviewRequired: false, resubmittedForReview: false };
    }

    accommodation.updatedAt = nowIso();
    updatedResult = { ...accommodation };
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: meta.reReviewRequired
      ? 'Accommodation updated successfully and sent for re-review'
      : (meta.resubmittedForReview ? 'Accommodation updated successfully and resubmitted for review' : 'Accommodation updated successfully'),
    data: { accommodation: toOwnerAccommodationResponse(updatedResult), statusChange: meta },
  });
});

const deleteMyAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  let deletedId;
  let filesToDelete = [];

  await withWriteLock(async (state) => {
    const idx = state.accommodations.findIndex((a) => sameId(a._id, req.params.id));
    if (idx === -1 || !sameId(state.accommodations[idx].owner, ownerId)) throw new ApiError(404, 'Accommodation not found');
    const acc = state.accommodations[idx];
    deletedId = String(acc._id);
    filesToDelete = (Array.isArray(acc.photos) ? acc.photos : [])
      .map((p) => p && p.storagePath)
      .filter(Boolean);
    state.accommodations.splice(idx, 1);
    // Also remove related reviews? keep data integrity; cascade delete reviews for this accommodation in local demo
    state.reviews = state.reviews.filter((r) => !sameId(r.accommodation, deletedId));
    // Remove from student favourites
    for (const s of state.students) {
      if (Array.isArray(s.favourites)) s.favourites = s.favourites.filter((fid) => !sameId(fid, deletedId));
    }
  });

  // Best-effort local file cleanup after committed DB/store change
  for (const rel of filesToDelete) {
    try {
      const abs = path.resolve(getAccommodationUploadsDir(), path.basename(path.dirname(rel)), path.basename(rel));
      // Only delete inside uploads root
      if (abs.startsWith(getAccommodationUploadsDir())) await fs.unlink(abs).catch(() => {});
    } catch (_) {}
  }

  return sendSuccess(res, { statusCode: 200, message: 'Accommodation deleted successfully', data: { id: deletedId } });
});

// Local photo upload (multer memory)
const upload = multer({ storage: multer.memoryStorage() });

const accommodationPhotoUploadMiddleware = (req, res, next) => {
  upload.array('photos', 10)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, 'Validation failed', [{ field: 'photos', message: `One or more files exceed the maximum size of ${getMaxUploadSizeMb()} MB` }]));
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return next(new ApiError(400, 'Validation failed', [{ field: 'photos', message: 'Unexpected file field. Use the photos field for image uploads.' }]));
      return next(new ApiError(400, 'Validation failed', [{ field: 'photos', message: err.message || 'Invalid file upload' }]));
    }
    return next(new ApiError(400, 'File upload failed', [{ field: 'photos', message: err.message || 'Invalid file upload' }]));
  });
};

function getActivePhotoCount(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => p && !isPhotoPendingDeletion(p)).length;
}

function extFromDetectedType(type) {
  if (type === 'jpeg') return '.jpg';
  if (type === 'png') return '.png';
  if (type === 'webp') return '.webp';
  return '.bin';
}

const uploadAccommodationPhotos = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodationId = req.params.id;
  const files = Array.isArray(req.files) ? req.files : [];

  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');
  if (files.length === 0) throw new ApiError(400, 'Validation failed', [{ field: 'photos', message: 'At least one image file is required' }]);

  // Verify ownership and limits before writing
  const current = findOwnedAccommodationOr404(accommodationId, ownerId);
  const maxPhotos = getMaxPhotosPerAccommodation();
  const activeCount = getActivePhotoCount(current.photos);
  if (activeCount + files.length > maxPhotos) {
    throw new ApiError(400, 'Validation failed', [{
      field: 'photos',
      message: `Cannot upload ${files.length} photo(s). This accommodation already has ${activeCount} active photo(s); maximum is ${maxPhotos}.`,
    }]);
  }

  const maxSizeBytes = getMaxUploadSizeMb() * 1024 * 1024;
  const validated = files.map((file, index) => {
    const info = validateImageFile(file, { index, maxSizeBytes });
    return { file, detectedType: info.detectedType, index };
  });

  const uploadsDir = getAccommodationUploadsDir();
  const accDir = path.join(uploadsDir, String(accommodationId));
  await fs.mkdir(accDir, { recursive: true });

  const savedFiles = [];
  const newPhotos = [];
  try {
    for (const { file, detectedType } of validated) {
      const ext = extFromDetectedType(detectedType);
      const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      const absPath = path.join(accDir, safeName);
      // Ensure path stays within accommodation directory
      if (!absPath.startsWith(accDir)) throw new ApiError(400, 'Invalid upload path');
      await fs.writeFile(absPath, file.buffer);
      savedFiles.push(absPath);
      const relStoragePath = path.join('accommodations', String(accommodationId), safeName).replace(/\\/g, '/');
      const publicUrl = `/api/local-uploads/${relStoragePath}`;
      newPhotos.push({
        _id: newId(),
        url: publicUrl,
        secureUrl: publicUrl,
        publicId: relStoragePath, // used as safe local reference for delete
        format: ext.replace('.', ''),
        width: null,
        height: null,
        filename: file.originalname || safeName,
        storagePath: relStoragePath,
        deletionStatus: 'active',
        deletionRequestedAt: null,
        deletionError: '',
        uploadedAt: nowIso(),
      });
    }

    await withWriteLock(async (state) => {
      const accommodation = state.accommodations.find((a) => sameId(a._id, accommodationId));
      if (!accommodation || !sameId(accommodation.owner, ownerId)) throw new ApiError(404, 'Accommodation not found');
      accommodation.photos = Array.isArray(accommodation.photos) ? accommodation.photos : [];
      const active = accommodation.photos.filter((p) => p && !isPhotoPendingDeletion(p)).length;
      if (active + newPhotos.length > maxPhotos) {
        throw new ApiError(400, 'Validation failed', [{ field: 'photos', message: `Photo limit exceeded. Maximum is ${maxPhotos}.` }]);
      }
      accommodation.photos.push(...newPhotos);
      accommodation.updatedAt = nowIso();
    });
  } catch (err) {
    // Best-effort cleanup of saved files if store update fails
    for (const f of savedFiles) await fs.unlink(f).catch(() => {});
    throw err;
  }

  const updated = getCollections().accommodations.find((a) => sameId(a._id, accommodationId));
  return sendSuccess(res, {
    statusCode: 201,
    message: 'Photo(s) uploaded successfully',
    data: {
      photos: sanitizePhotoArrayForResponse(newPhotos, accommodationId),
      totalPhotos: getActivePhotoCount(updated ? updated.photos : []),
      accommodationId: String(accommodationId),
    },
  });
});

const deleteAccommodationPhoto = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const { id: accommodationId, photoId } = req.params;

  if (!photoId || typeof photoId !== 'string' || !photoId.trim()) throw new ApiError(400, 'Invalid photo ID/reference');

  let fileToDelete = null;
  let removedPhotoId = null;

  await withWriteLock(async (state) => {
    const accommodation = state.accommodations.find((a) => sameId(a._id, accommodationId));
    if (!accommodation || !sameId(accommodation.owner, ownerId)) throw new ApiError(404, 'Accommodation not found');
    const photos = Array.isArray(accommodation.photos) ? accommodation.photos : [];
    const idx = photos.findIndex((p) => {
      if (!p || isPhotoPendingDeletion(p)) return false;
      if (p._id && String(p._id) === photoId) return true;
      if (p.publicId && String(p.publicId) === photoId) return true;
      return false;
    });
    if (idx === -1) throw new ApiError(404, 'Photo not found');

    const photo = photos[idx];
    removedPhotoId = photo._id ? String(photo._id) : photoId;
    fileToDelete = photo.storagePath || (photo.publicId && String(photo.publicId).startsWith('accommodations/') ? photo.publicId : null);

    // Remove metadata from store (committed before file deletion attempt is not possible in same atomic fs+json op;
    // we remove metadata first to keep DB consistent and avoid broken references; then attempt file delete best-effort)
    photos.splice(idx, 1);
    accommodation.photos = photos;
    accommodation.updatedAt = nowIso();
  });

  if (fileToDelete) {
    try {
      const abs = path.resolve(getAccommodationUploadsDir(), fileToDelete);
      if (abs.startsWith(getAccommodationUploadsDir())) await fs.unlink(abs).catch(() => {});
    } catch (_) {
      // Best-effort: metadata already removed; orphan file cleanup is non-critical in local demo
    }
  }

  const updated = getCollections().accommodations.find((a) => sameId(a._id, accommodationId));
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Photo deleted successfully',
    data: {
      accommodationId: String(accommodationId),
      photoId: removedPhotoId || String(photoId),
      remainingPhotos: getActivePhotoCount(updated ? updated.photos : []),
    },
  });
});

module.exports = {
  createAccommodation,
  getMyAccommodations,
  getMyAccommodationById,
  updateMyAccommodation,
  deleteMyAccommodation,
  uploadAccommodationPhotos,
  deleteAccommodationPhoto,
  accommodationPhotoUploadMiddleware,
};
