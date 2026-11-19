const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { Accommodation } = require('../models');
const {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  BATHROOM_TYPES,
  AVAILABILITY_STATUS,
} = require('../utils/constants');
const { isValidUrl, isValidObjectId, trimString } = require('../utils/validators');
const {
  getCloudinary,
  getUploadFolder,
  getMaxUploadSizeMb,
  getMaxPhotosPerAccommodation,
} = require('../config/cloudinary');
const {
  validateImageFile,
  generateSafePublicIdPrefix,
  sanitizePhotoArrayForResponse,
  isPhotoPendingDeletion,
} = require('../utils/uploadValidation');

const PROTECTED_FIELDS = new Set([
  'owner',
  'status',
  'rejectionReason',
  'isDemo',
  '_id',
  'id',
  'createdAt',
  'updatedAt',
  '__v',
]);

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'name',
  'description',
  'accommodationType',
  'genderType',
  'suitableFor',
  'location',
  'pricing',
  'roomDetails',
  'foodInfo',
  'facilities',
  'rules',
  'availability',
  'contact',
  // 'photos' intentionally excluded: managed only via dedicated upload/delete endpoints
]);

const LOCATION_FIELDS = ['state', 'district', 'city', 'locality', 'fullAddress', 'landmark', 'googleMapsLink'];
const PRICING_FIELDS = [
  'monthlyRent',
  'securityDeposit',
  'electricityCharges',
  'waterCharges',
  'foodCharges',
  'otherCharges',
  'includedChargesInfo',
  'extraChargesInfo',
];
const ROOM_FIELDS = ['roomType', 'totalRooms', 'availableRoomsOrBeds', 'bathroomType', 'furnishing'];
const FOOD_FIELDS = ['foodProvided', 'selfCookingAllowed', 'homeFoodDeliveryAllowed'];
const RULE_FIELDS = ['entryTiming', 'visitorRules', 'additionalRules'];
const AVAILABILITY_FIELDS = ['status', 'availableBeds', 'availableFrom'];
const CONTACT_FIELDS = ['ownerDisplayName', 'contactNumber'];

function pushError(errors, field, message) {
  errors.push({ field, message });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function validateStringField(errors, value, field, { required = false, min = 0, max = Infinity, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null || value === '') {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') {
    pushError(errors, field, `${name} must be a string`);
    return undefined;
  }
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
  if (!allowed.includes(value)) {
    pushError(errors, field, `${name} must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return value;
}

function validateNonNegativeNumber(errors, value, field, { required = false, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null || value === '') {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    pushError(errors, field, `${name} must be a non-negative number`);
    return undefined;
  }
  return num;
}

function validateBooleanField(errors, value, field, { required = false, label } = {}) {
  const name = label || field;
  if (value === undefined || value === null) {
    if (required) pushError(errors, field, `${name} is required`);
    return undefined;
  }
  if (typeof value !== 'boolean') {
    pushError(errors, field, `${name} must be true or false`);
    return undefined;
  }
  return value;
}

function validateLocation(location, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(location)) {
    pushError(errors, 'location', 'Location information is required');
    return undefined;
  }
  if (location === undefined) return undefined;
  if (!isPlainObject(location)) {
    pushError(errors, 'location', 'Location must be an object');
    return undefined;
  }

  const out = {};
  for (const key of Object.keys(location)) {
    if (!LOCATION_FIELDS.includes(key)) pushError(errors, `location.${key}`, `location.${key} is not allowed`);
  }

  const required = !partial;
  out.state = validateStringField(errors, location.state, 'location.state', { required, max: 100, label: 'State' });
  out.district = validateStringField(errors, location.district, 'location.district', { required, max: 100, label: 'District' });
  out.city = validateStringField(errors, location.city, 'location.city', { required, max: 100, label: 'City' });
  out.locality = validateStringField(errors, location.locality, 'location.locality', { required, max: 100, label: 'Locality' });
  out.fullAddress = validateStringField(errors, location.fullAddress, 'location.fullAddress', { required, max: 500, label: 'Full address' });
  out.landmark = validateStringField(errors, location.landmark, 'location.landmark', { required: false, max: 200, label: 'Landmark' });

  if (location.googleMapsLink !== undefined) {
    const link = asTrimmedString(location.googleMapsLink);
    if (required && !link) {
      pushError(errors, 'location.googleMapsLink', 'Google Maps link is required');
    } else if (link) {
      if (!isValidUrl(link)) pushError(errors, 'location.googleMapsLink', 'Please provide a valid Google Maps URL');
      else out.googleMapsLink = link;
    } else if (!required) {
      out.googleMapsLink = '';
    }
  } else if (required) {
    pushError(errors, 'location.googleMapsLink', 'Google Maps link is required');
  }

  // remove undefined keys
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validatePricing(pricing, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(pricing)) {
    pushError(errors, 'pricing', 'Pricing information is required');
    return undefined;
  }
  if (pricing === undefined) return undefined;
  if (!isPlainObject(pricing)) {
    pushError(errors, 'pricing', 'Pricing must be an object');
    return undefined;
  }

  const out = {};
  for (const key of Object.keys(pricing)) {
    if (!PRICING_FIELDS.includes(key)) pushError(errors, `pricing.${key}`, `pricing.${key} is not allowed`);
  }

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
  if (!partial && !isPlainObject(roomDetails)) {
    pushError(errors, 'roomDetails', 'Room details are required');
    return undefined;
  }
  if (roomDetails === undefined) return undefined;
  if (!isPlainObject(roomDetails)) {
    pushError(errors, 'roomDetails', 'Room details must be an object');
    return undefined;
  }

  const out = {};
  for (const key of Object.keys(roomDetails)) {
    if (!ROOM_FIELDS.includes(key)) pushError(errors, `roomDetails.${key}`, `roomDetails.${key} is not allowed`);
  }

  out.roomType = validateEnumField(errors, roomDetails.roomType, 'roomDetails.roomType', ROOM_TYPES, { required: !partial, label: 'Room type' });
  out.totalRooms = validateNonNegativeNumber(errors, roomDetails.totalRooms, 'roomDetails.totalRooms', { required: false, label: 'Total rooms' });
  out.availableRoomsOrBeds = validateNonNegativeNumber(errors, roomDetails.availableRoomsOrBeds, 'roomDetails.availableRoomsOrBeds', { required: false, label: 'Available rooms/beds' });
  out.bathroomType = validateEnumField(errors, roomDetails.bathroomType, 'roomDetails.bathroomType', BATHROOM_TYPES, { required: !partial, label: 'Bathroom type' });
  out.furnishing = validateStringField(errors, roomDetails.furnishing, 'roomDetails.furnishing', { required: false, max: 500, label: 'Furnishing' });

  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateFoodInfo(foodInfo, errors, { partial = false } = {}) {
  if (foodInfo === undefined) return undefined;
  if (!isPlainObject(foodInfo)) {
    pushError(errors, 'foodInfo', 'Food information must be an object');
    return undefined;
  }
  const out = {};
  for (const key of Object.keys(foodInfo)) {
    if (!FOOD_FIELDS.includes(key)) pushError(errors, `foodInfo.${key}`, `foodInfo.${key} is not allowed`);
  }
  out.foodProvided = validateBooleanField(errors, foodInfo.foodProvided, 'foodInfo.foodProvided', { required: false, label: 'Food provided' });
  out.selfCookingAllowed = validateBooleanField(errors, foodInfo.selfCookingAllowed, 'foodInfo.selfCookingAllowed', { required: false, label: 'Self-cooking allowed' });
  out.homeFoodDeliveryAllowed = validateBooleanField(errors, foodInfo.homeFoodDeliveryAllowed, 'foodInfo.homeFoodDeliveryAllowed', { required: false, label: 'Home food delivery allowed' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateRules(rules, errors, { partial = false } = {}) {
  if (rules === undefined) return undefined;
  if (!isPlainObject(rules)) {
    pushError(errors, 'rules', 'Rules must be an object');
    return undefined;
  }
  const out = {};
  for (const key of Object.keys(rules)) {
    if (!RULE_FIELDS.includes(key)) pushError(errors, `rules.${key}`, `rules.${key} is not allowed`);
  }
  out.entryTiming = validateStringField(errors, rules.entryTiming, 'rules.entryTiming', { required: false, max: 200, label: 'Entry timing' });
  out.visitorRules = validateStringField(errors, rules.visitorRules, 'rules.visitorRules', { required: false, max: 500, label: 'Visitor rules' });
  out.additionalRules = validateStringField(errors, rules.additionalRules, 'rules.additionalRules', { required: false, max: 1000, label: 'Additional rules' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateAvailability(availability, errors, { partial = false } = {}) {
  if (availability === undefined) return undefined;
  if (!isPlainObject(availability)) {
    pushError(errors, 'availability', 'Availability must be an object');
    return undefined;
  }
  const out = {};
  for (const key of Object.keys(availability)) {
    if (!AVAILABILITY_FIELDS.includes(key)) pushError(errors, `availability.${key}`, `availability.${key} is not allowed`);
  }
  out.status = validateEnumField(errors, availability.status, 'availability.status', AVAILABILITY_STATUS, { required: false, label: 'Availability status' });
  out.availableBeds = validateNonNegativeNumber(errors, availability.availableBeds, 'availability.availableBeds', { required: false, label: 'Available beds' });
  if (availability.availableFrom !== undefined) {
    if (availability.availableFrom === null || availability.availableFrom === '') {
      out.availableFrom = null;
    } else {
      const d = new Date(availability.availableFrom);
      if (Number.isNaN(d.getTime())) pushError(errors, 'availability.availableFrom', 'Available from must be a valid date');
      else out.availableFrom = d;
    }
  }
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateContact(contact, errors, { partial = false } = {}) {
  if (!partial && !isPlainObject(contact)) {
    pushError(errors, 'contact', 'Contact information is required');
    return undefined;
  }
  if (contact === undefined) return undefined;
  if (!isPlainObject(contact)) {
    pushError(errors, 'contact', 'Contact information must be an object');
    return undefined;
  }
  const out = {};
  for (const key of Object.keys(contact)) {
    if (!CONTACT_FIELDS.includes(key)) pushError(errors, `contact.${key}`, `contact.${key} is not allowed`);
  }
  out.ownerDisplayName = validateStringField(errors, contact.ownerDisplayName, 'contact.ownerDisplayName', { required: !partial, max: 100, label: 'Owner display name' });
  out.contactNumber = validateStringField(errors, contact.contactNumber, 'contact.contactNumber', { required: !partial, min: 7, max: 20, label: 'Contact number' });
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
  return out;
}

function validateFacilities(facilities, errors) {
  if (facilities === undefined) return undefined;
  if (!Array.isArray(facilities)) {
    pushError(errors, 'facilities', 'Facilities must be an array of strings');
    return undefined;
  }
  const cleaned = [];
  facilities.forEach((item, idx) => {
    if (typeof item !== 'string' || !item.trim()) {
      pushError(errors, `facilities[${idx}]`, 'Each facility must be a non-empty string');
    } else {
      cleaned.push(item.trim());
    }
  });
  return cleaned;
}

function validatePhotos(photos, errors) {
  if (photos === undefined) return undefined;
  if (!Array.isArray(photos)) {
    pushError(errors, 'photos', 'Photos must be an array');
    return undefined;
  }
  const cleaned = [];
  photos.forEach((item, idx) => {
    if (typeof item === 'string') {
      const url = item.trim();
      if (!url) pushError(errors, `photos[${idx}]`, 'Photo URL/path cannot be empty');
      else cleaned.push({ url });
      return;
    }
    if (isPlainObject(item)) {
      const url = typeof item.url === 'string' ? item.url.trim() : '';
      if (!url) {
        pushError(errors, `photos[${idx}].url`, 'Photo URL/path is required');
        return;
      }
      const photo = { url };
      if (item.filename !== undefined) {
        if (typeof item.filename !== 'string') pushError(errors, `photos[${idx}].filename`, 'Photo filename must be a string');
        else photo.filename = item.filename.trim();
      }
      if (item.uploadedAt !== undefined) {
        const d = new Date(item.uploadedAt);
        if (Number.isNaN(d.getTime())) pushError(errors, `photos[${idx}].uploadedAt`, 'Photo uploadedAt must be a valid date');
        else photo.uploadedAt = d;
      }
      cleaned.push(photo);
      return;
    }
    pushError(errors, `photos[${idx}]`, 'Each photo must be a string URL/path or an object with url');
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
  data.suitableFor = validateStringField(errors, body.suitableFor, 'suitableFor', { required: false, max: 200, label: 'Suitable occupants' });

  data.location = validateLocation(body.location, errors, { partial: false });
  data.pricing = validatePricing(body.pricing, errors, { partial: false });
  data.roomDetails = validateRoomDetails(body.roomDetails, errors, { partial: false });
  data.foodInfo = validateFoodInfo(body.foodInfo, errors, { partial: true }) || { foodProvided: false, selfCookingAllowed: false, homeFoodDeliveryAllowed: false };
  data.facilities = validateFacilities(body.facilities, errors) || [];
  data.rules = validateRules(body.rules, errors, { partial: true }) || {};
  data.availability = validateAvailability(body.availability, errors, { partial: true }) || { status: AVAILABILITY_STATUS.AVAILABLE, availableBeds: 0, availableFrom: null };
  data.contact = validateContact(body.contact, errors, { partial: false });
  // Photos are managed only through dedicated upload/delete endpoints
  data.photos = [];

  // Clean undefined top-level fields
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
  if (Object.prototype.hasOwnProperty.call(body, 'suitableFor')) data.suitableFor = validateStringField(errors, body.suitableFor, 'suitableFor', { required: false, max: 200, label: 'Suitable occupants' });

  if (Object.prototype.hasOwnProperty.call(body, 'location')) data.location = validateLocation(body.location, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'pricing')) data.pricing = validatePricing(body.pricing, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'roomDetails')) data.roomDetails = validateRoomDetails(body.roomDetails, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'foodInfo')) data.foodInfo = validateFoodInfo(body.foodInfo, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'facilities')) data.facilities = validateFacilities(body.facilities, errors);
  if (Object.prototype.hasOwnProperty.call(body, 'rules')) data.rules = validateRules(body.rules, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'availability')) data.availability = validateAvailability(body.availability, errors, { partial: true });
  if (Object.prototype.hasOwnProperty.call(body, 'contact')) data.contact = validateContact(body.contact, errors, { partial: true });

  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (Object.keys(data).length === 0) throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'No valid updatable fields provided' }]);
  return data;
}

function mergeNested(existing = {}, updates = {}) {
  return { ...(existing && typeof existing === 'object' ? existing : {}), ...updates };
}

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
  // Safe re-review policy: any owner edit to listing content/contact/photos/availability details
  // on an approved listing triggers re-review. (Even availability changes can affect listing accuracy.)
  const substantiveKeys = [
    'name', 'description', 'accommodationType', 'genderType', 'suitableFor',
    'location', 'pricing', 'roomDetails', 'foodInfo', 'facilities', 'rules', 'availability', 'contact', 'photos',
  ];
  return substantiveKeys.some((k) => Object.prototype.hasOwnProperty.call(updates, k));
}

function toOwnerAccommodationResponse(accommodationDoc) {
  const obj = accommodationDoc.toObject ? accommodationDoc.toObject() : accommodationDoc;
  return {
    id: String(obj._id),
    owner: String(obj.owner),
    name: obj.name,
    description: obj.description,
    accommodationType: obj.accommodationType,
    genderType: obj.genderType,
    suitableFor: obj.suitableFor || '',
    location: obj.location || {},
    pricing: obj.pricing || {},
    roomDetails: obj.roomDetails || {},
    foodInfo: obj.foodInfo || {},
    facilities: Array.isArray(obj.facilities) ? obj.facilities : [],
    rules: obj.rules || {},
    availability: obj.availability || {},
    contact: obj.contact || {},
    photos: sanitizePhotoArrayForResponse(obj.photos, obj._id),
    status: obj.status,
    rejectionReason: obj.rejectionReason || '',
    isDemo: Boolean(obj.isDemo),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

async function findOwnedAccommodationOr404(accommodationId, ownerId) {
  if (!isValidObjectId(accommodationId)) {
    throw new ApiError(400, 'Invalid accommodation ID');
  }
  const accommodation = await Accommodation.findById(accommodationId);
  if (!accommodation || String(accommodation.owner) !== String(ownerId)) {
    // Do not leak existence of another owner's listing
    throw new ApiError(404, 'Accommodation not found');
  }
  return accommodation;
}

const createAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const data = validateCreatePayload(req.body);

  const accommodation = await Accommodation.create({
    ...data,
    owner: ownerId, // always derived from authenticated owner
    status: ACCOMMODATION_STATUS.PENDING, // new listings always pending
    rejectionReason: '',
    isDemo: false,
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Accommodation created successfully and submitted for review',
    data: { accommodation: toOwnerAccommodationResponse(accommodation) },
  });
});

const getMyAccommodations = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodations = await Accommodation.find({ owner: ownerId }).sort({ createdAt: -1 });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Owner accommodations retrieved successfully',
    data: {
      accommodations: accommodations.map(toOwnerAccommodationResponse),
      count: accommodations.length,
    },
  });
});

const getMyAccommodationById = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodation = await findOwnedAccommodationOr404(req.params.id, ownerId);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation retrieved successfully',
    data: { accommodation: toOwnerAccommodationResponse(accommodation) },
  });
});

const updateMyAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodation = await findOwnedAccommodationOr404(req.params.id, ownerId);
  const updates = validateUpdatePayload(req.body);

  const wasApproved = accommodation.status === ACCOMMODATION_STATUS.APPROVED;
  const wasRejected = accommodation.status === ACCOMMODATION_STATUS.REJECTED;

  applyAccommodationUpdates(accommodation, updates);

  // Safe re-review/resubmission policy:
  // - Approved listing: any substantive edit moves it back to pending for admin review.
  // - Rejected listing: owner edit is treated as resubmission, moves to pending.
  //   Rejection reason is retained while rejected, and cleared upon resubmission.
  // - Pending listing: remains pending.
  if (wasApproved && isSubstantiveUpdateForReview(updates)) {
    accommodation.status = ACCOMMODATION_STATUS.PENDING;
    accommodation.rejectionReason = '';
  } else if (wasRejected) {
    accommodation.status = ACCOMMODATION_STATUS.PENDING;
    accommodation.rejectionReason = '';
  }

  await accommodation.save();

  return sendSuccess(res, {
    statusCode: 200,
    message:
      wasApproved && isSubstantiveUpdateForReview(updates)
        ? 'Accommodation updated successfully and sent for re-review'
        : wasRejected
        ? 'Accommodation resubmitted successfully and sent for review'
        : 'Accommodation updated successfully',
    data: { accommodation: toOwnerAccommodationResponse(accommodation) },
  });
});

const deleteMyAccommodation = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodation = await findOwnedAccommodationOr404(req.params.id, ownerId);

  await accommodation.deleteOne();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation deleted successfully',
    data: { id: String(accommodation._id) },
  });
});

function getActivePhotoCount(photos) {
  return (Array.isArray(photos) ? photos : []).filter((p) => !isPhotoPendingDeletion(p)).length;
}

function safeErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (err instanceof ApiError) return err.message;
  if (typeof err.message === 'string' && err.message.trim()) return err.message.trim().slice(0, 300);
  if (typeof err.name === 'string' && err.name.trim()) return err.name.trim().slice(0, 300);
  return 'Error';
}

function safeLogPhotoEvent(level, event, meta = {}) {
  // Structured server-side log. Never include credentials/secrets/tokens.
  const payload = {
    ts: new Date().toISOString(),
    scope: 'accommodation_photo',
    event,
    ...meta,
  };
  let line = '';
  try {
    line = JSON.stringify(payload);
  } catch (_e) {
    line = JSON.stringify({ ts: payload.ts, scope: payload.scope, event: payload.event });
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

function getMulterUpload() {
  const maxUploadSizeBytes = getMaxUploadSizeMb() * 1024 * 1024;
  const maxFiles = getMaxPhotosPerAccommodation();
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxUploadSizeBytes,
      files: maxFiles,
    },
  });
}

const accommodationPhotoUploadMiddleware = (req, res, next) => {
  const upload = getMulterUpload();
  const maxFiles = getMaxPhotosPerAccommodation();
  upload.array('photos', maxFiles)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, 'Validation failed', [{ field: 'photos', message: `Each image must be at most ${getMaxUploadSizeMb()} MB` }]));
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, 'Validation failed', [{ field: 'photos', message: `Too many files. Maximum ${getMaxPhotosPerAccommodation()} photos allowed per upload/request` }]));
      }
      return next(new ApiError(400, 'Invalid file upload request', [{ field: 'photos', message: err.message }]));
    }
    return next(err);
  });
};

function uploadBufferToCloudinary(cloudinary, buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
    stream.end(buffer);
  });
}

async function cleanupUploadedCloudinaryAssets(cloudinary, uploadedAssets, context = {}) {
  // Best-effort cleanup: attempt every deletion, record/check every result, and never claim
  // deletion unless Cloudinary confirms it (result "ok" or "not found"). Failures are logged
  // with safe structured metadata (no credentials) but not silently ignored.
  if (!Array.isArray(uploadedAssets) || uploadedAssets.length === 0) return;

  const results = await Promise.allSettled(
    uploadedAssets.map((asset) =>
      cloudinary.uploader.destroy(asset.publicId, {
        resource_type: (asset && asset.resourceType) || 'image',
        invalidate: true,
      })
    )
  );

  results.forEach((settled, idx) => {
    const asset = uploadedAssets[idx] || {};
    const baseMeta = {
      ...context,
      publicId: asset.publicId || '',
      resourceType: asset.resourceType || 'image',
    };

    if (settled.status === 'rejected') {
      safeLogPhotoEvent('error', 'upload_cleanup_destroy_failed', {
        ...baseMeta,
        error: safeErrorMessage(settled.reason),
        note: 'Cleanup attempt failed; Cloudinary asset may still exist (best-effort cleanup).',
      });
      return;
    }

    const result = settled.value;
    const confirmed = result && (result.result === 'ok' || result.result === 'not found');
    if (confirmed) {
      safeLogPhotoEvent('info', 'upload_cleanup_destroy_confirmed', {
        ...baseMeta,
        cloudinaryResult: result.result,
      });
    } else {
      safeLogPhotoEvent('error', 'upload_cleanup_destroy_unconfirmed', {
        ...baseMeta,
        cloudinaryResult: result ? result.result : null,
        note: 'Cloudinary did not confirm deletion; asset may still exist.',
      });
    }
  });
}

const uploadAccommodationPhotos = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const accommodation = await findOwnedAccommodationOr404(req.params.id, ownerId);
  const files = Array.isArray(req.files) ? req.files : [];

  if (files.length === 0) {
    throw new ApiError(400, 'Validation failed', [{ field: 'photos', message: 'At least one image file is required (multipart/form-data field: photos)' }]);
  }

  const maxPhotos = getMaxPhotosPerAccommodation();
  const existingActiveCount = getActivePhotoCount(accommodation.photos);
  if (existingActiveCount + files.length > maxPhotos) {
    throw new ApiError(400, 'Validation failed', [{
      field: 'photos',
      message: `Photo limit exceeded. This accommodation already has ${existingActiveCount} active photo(s); maximum allowed is ${maxPhotos}`,
    }]);
  }

  const maxSizeBytes = getMaxUploadSizeMb() * 1024 * 1024;
  files.forEach((file, index) => validateImageFile(file, { index, maxSizeBytes }));

  // Ensures Cloudinary is configured before upload attempts (fails safely with 503 if not).
  const cloudinary = getCloudinary();
  const folder = getUploadFolder();
  const uploadedAssets = [];
  const savedPhotoPayloads = [];

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const publicIdPrefix = generateSafePublicIdPrefix(accommodation._id);
      const uploadOptions = {
        folder,
        public_id: publicIdPrefix,
        resource_type: 'image',
        overwrite: false,
        unique_filename: false,
        use_filename: false,
      };
      const result = await uploadBufferToCloudinary(cloudinary, file.buffer, uploadOptions);
      uploadedAssets.push({ publicId: result.public_id, resourceType: result.resource_type || 'image' });
      savedPhotoPayloads.push({
        url: result.secure_url,
        secureUrl: result.secure_url,
        publicId: result.public_id,
        format: result.format || '',
        width: typeof result.width === 'number' ? result.width : null,
        height: typeof result.height === 'number' ? result.height : null,
        filename: file.originalname || '',
        uploadedAt: result.created_at ? new Date(result.created_at) : new Date(),
        deletionStatus: 'active',
        deletionRequestedAt: null,
        deletionError: '',
      });
    }

    accommodation.photos = [...(Array.isArray(accommodation.photos) ? accommodation.photos : []), ...savedPhotoPayloads];
    await accommodation.save();

    // Return only newly added active photos for convenience, and active total count.
    const newlyAdded = sanitizePhotoArrayForResponse(savedPhotoPayloads, accommodation._id);
    const totalActivePhotos = getActivePhotoCount(accommodation.photos);

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Photos uploaded successfully',
      data: {
        photos: newlyAdded,
        totalPhotos: totalActivePhotos,
        accommodationId: String(accommodation._id),
      },
    });
  } catch (err) {
    // Best-effort cleanup of any Cloudinary assets uploaded in this request to avoid orphans.
    // Cleanup is attempted for every uploaded asset and each result is checked/logged.
    // If Cloudinary is unavailable, cleanup cannot be guaranteed.
    if (uploadedAssets.length > 0) {
      await cleanupUploadedCloudinaryAssets(cloudinary, uploadedAssets, {
        accommodationId: String(accommodation._id),
        ownerId: String(ownerId),
        reason: 'upload_or_save_failure',
      });
    }

    if (err instanceof ApiError) throw err;
    // Cloudinary/config/runtime upload failure (or DB save failure after upload with cleanup attempted)
    throw new ApiError(502, 'Failed to upload image(s). Please try again later.', [], false);
  }
});

function findActivePhotoMatchIndex(photos, photoId) {
  return (Array.isArray(photos) ? photos : []).findIndex((p) => {
    if (!p || isPhotoPendingDeletion(p)) return false;
    const subId = p._id ? String(p._id) : null;
    if (subId && subId === photoId) return true;
    // Fallback for legacy/reference matching (note: public IDs with '/' cannot be represented as a single route segment)
    if (p.publicId && String(p.publicId) === photoId) return true;
    return false;
  });
}

async function restorePhotoToActiveState(accommodation, photo, errorReason, logContext = {}) {
  try {
    photo.deletionStatus = 'active';
    photo.deletionRequestedAt = null;
    photo.deletionError = safeErrorMessage(errorReason).slice(0, 300);
    await accommodation.save();
    safeLogPhotoEvent('warn', 'photo_delete_restored_active_after_cloudinary_failure', {
      ...logContext,
      reason: photo.deletionError,
    });
    return true;
  } catch (restoreErr) {
    safeLogPhotoEvent('error', 'photo_delete_restore_failed_pending_retained', {
      ...logContext,
      originalReason: safeErrorMessage(errorReason),
      restoreError: safeErrorMessage(restoreErr),
      recovery: 'Photo remains in pending_deletion state in database (not treated as a normal active/displayable photo). Manual or retry recovery required.',
    });
    // DB state should remain pending_deletion from step 1 (recoverable) if this save fails.
    return false;
  }
}

const deleteAccommodationPhoto = asyncHandler(async (req, res) => {
  const ownerId = req.auth.id;
  const { id: accommodationId, photoId } = req.params;
  const accommodation = await findOwnedAccommodationOr404(accommodationId, ownerId);

  if (!photoId || typeof photoId !== 'string' || !photoId.trim()) {
    throw new ApiError(400, 'Invalid photo ID/reference');
  }

  const photos = Array.isArray(accommodation.photos) ? accommodation.photos : [];
  const photoIndex = findActivePhotoMatchIndex(photos, photoId);

  if (photoIndex === -1) {
    // Do not leak existence of photos on other accommodations/owners; ownership already enforced.
    // Pending-deletion photos are not treated as normal active/deletable photos.
    throw new ApiError(404, 'Photo not found');
  }

  const photo = photos[photoIndex];
  const publicId = photo && photo.publicId ? String(photo.publicId).trim() : '';
  const photoRef = photo._id ? String(photo._id) : photoId;
  const logContext = {
    accommodationId: String(accommodation._id),
    ownerId: String(ownerId),
    photoId: photoRef,
  };

  // If Cloudinary-managed asset exists, ensure Cloudinary is configured before mutating DB state.
  // (Legacy photos without publicId can be removed from DB even if Cloudinary is not configured.)
  let cloudinary = null;
  if (publicId) {
    cloudinary = getCloudinary();
  }

  // Step 1 (two-stage deletion): mark photo pending deletion and persist state.
  // Public serializers exclude pending-deletion photos from normal displayable responses.
  photo.deletionStatus = 'pending_deletion';
  photo.deletionRequestedAt = new Date();
  photo.deletionError = '';
  try {
    await accommodation.save();
  } catch (err) {
    safeLogPhotoEvent('error', 'photo_delete_mark_pending_failed', {
      ...logContext,
      error: safeErrorMessage(err),
    });
    throw new ApiError(500, 'Failed to initiate photo deletion. Please try again.', [], false);
  }

  // Step 2: perform Cloudinary deletion using the stored public ID (never client-supplied).
  if (publicId) {
    let destroyResult;
    try {
      destroyResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
    } catch (err) {
      // Step 4: Cloudinary deletion failed -> restore to active state where possible.
      await restorePhotoToActiveState(accommodation, photo, err, logContext);
      throw new ApiError(502, 'Failed to delete image from storage. Please try again later.', [], false);
    }

    const destroyConfirmed = destroyResult && (destroyResult.result === 'ok' || destroyResult.result === 'not found');
    if (!destroyConfirmed) {
      // Step 4: not confirmed -> do not claim deletion; restore active state where possible.
      await restorePhotoToActiveState(
        accommodation,
        photo,
        `Cloudinary deletion not confirmed (result: ${destroyResult ? destroyResult.result : 'unknown'})`,
        logContext
      );
      throw new ApiError(502, 'Failed to delete image from storage. Please try again later.', [], false);
    }

    safeLogPhotoEvent('info', 'photo_cloudinary_delete_confirmed', {
      ...logContext,
      cloudinaryResult: destroyResult.result,
    });
  } else {
    safeLogPhotoEvent('info', 'photo_delete_no_cloudinary_asset', {
      ...logContext,
      note: 'No Cloudinary publicId on stored record (legacy/non-Cloudinary photo); DB metadata removal only.',
    });
  }

  // Step 3: Cloudinary deletion confirmed (or not applicable) -> remove photo metadata from MongoDB.
  // Step 5: if this final save fails after Cloudinary deletion, retain persisted pending-deletion state
  // (DB remains at step 1 state because the save does not commit) so the broken image is not treated
  // as a normal active/displayable photo.
  const currentPhotos = Array.isArray(accommodation.photos) ? accommodation.photos : [];
  let removeIdx = currentPhotos.findIndex((p) => p === photo);
  if (removeIdx === -1 && photo && photo._id) {
    removeIdx = currentPhotos.findIndex((p) => p && p._id && String(p._id) === String(photo._id));
  }
  if (removeIdx === -1) {
    removeIdx = currentPhotos.findIndex((p) => p && p.deletionStatus === 'pending_deletion' && (
      (photo && photo._id && p._id && String(p._id) === String(photo._id)) || p === photo
    ));
  }
  if (removeIdx !== -1) {
    currentPhotos.splice(removeIdx, 1);
  }
  accommodation.photos = currentPhotos;

  try {
    await accommodation.save();
  } catch (err) {
    safeLogPhotoEvent('error', 'photo_delete_final_save_failed_pending_retained', {
      ...logContext,
      cloudinaryDeletedOrNotApplicable: true,
      cloudinaryDeleteConfirmed: publicId ? true : null,
      error: safeErrorMessage(err),
      recovery: 'Photo remains pending_deletion in database and is excluded from normal display. Identify pending-deletion records in accommodation.photos and retry/recover manually.',
    });
    const message = publicId
      ? 'Image was removed from storage, but finalizing the database update failed. The photo is marked pending deletion and hidden from normal display. Please retry or recover manually.'
      : 'Failed to finalize photo deletion in the database. The photo is marked pending deletion and hidden from normal display. Please retry.';
    throw new ApiError(500, message, [], false);
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Photo deleted successfully',
    data: {
      accommodationId: String(accommodation._id),
      photoId: photoRef,
      remainingPhotos: getActivePhotoCount(accommodation.photos),
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
  validateCreatePayload,
  validateUpdatePayload,
  toOwnerAccommodationResponse,
};
