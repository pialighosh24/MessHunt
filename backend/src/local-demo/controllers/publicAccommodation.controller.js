const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const { getCollections } = require('../store');
const { isValidId, sameId } = require('../ids');
const {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  AVAILABILITY_STATUS,
} = require('../../utils/constants');
const { isValidObjectId } = require('../../utils/validators');
const { sanitizePhotoArrayForResponse } = require('../../utils/uploadValidation');
const {
  PUBLIC_REVIEW_MODERATION_STATUSES,
  buildEmptyRatingSummary,
  getReviewAggregatesByAccommodationIds,
  getReviewAggregateForAccommodation,
} = require('../utils/reviewAggregation');

const SUPPORTED_QUERY_PARAMS = new Set([
  'page', 'limit', 'sort', 'sortBy', 'city', 'locality', 'minRent', 'maxRent',
  'accommodationType', 'genderType', 'suitableFor', 'roomType', 'foodProvided',
  'selfCookingAllowed', 'homeFoodDeliveryAllowed', 'availability',
]);

function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function parsePositiveInt(value, fieldName, { defaultValue, min = 1, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a valid integer` }]);
  }
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a valid integer` }]);
  }
  const num = Number(str);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be between ${min} and ${max}` }]);
  }
  return num;
}

function parseNonNegativeNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a non-negative number` }]);
  }
  return num;
}

function parseEnum(value, fieldName, allowed) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a string` }]);
  }
  const trimmed = value.trim();
  if (!allowed.includes(trimmed)) {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be one of: ${allowed.join(', ')}` }]);
  }
  return trimmed;
}

function parseBooleanQuery(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a boolean value (true/false)` }]);
}

function parseSafeSearchString(value, fieldName, { maxLength = 100 } = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a string` }]);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be at most ${maxLength} characters` }]);
  }
  return trimmed;
}

function validateSupportedQueryParams(query) {
  const unsupported = Object.keys(query || {}).filter((key) => !SUPPORTED_QUERY_PARAMS.has(key));
  if (unsupported.length > 0) {
    throw new ApiError(400, 'Validation failed', unsupported.map((field) => ({ field, message: `${field} is not a supported filter` })));
  }
}

function buildSort(query) {
  const sortKey = (query.sortBy || query.sort || 'newest');
  if (typeof sortKey !== 'string') {
    throw new ApiError(400, 'Validation failed', [{ field: 'sortBy', message: 'sortBy must be a string' }]);
  }
  const normalized = sortKey.trim().toLowerCase();
  const allowed = ['newest', 'oldest', 'rent_asc', 'rent_desc', 'rating_desc', 'rating_asc', 'rating'];
  if (!allowed.includes(normalized)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'sortBy', message: `sortBy must be one of: ${allowed.join(', ')}` }]);
  }
  return { sortBy: normalized === 'rating' ? 'rating_desc' : normalized };
}

function normalizeRatingSummary(summary) {
  if (!summary) return buildEmptyRatingSummary();
  const reviewCount = Number(summary.reviewCount || 0);
  const averageRating = reviewCount > 0 && summary.averageRating !== null && summary.averageRating !== undefined
    ? Math.round(Number(summary.averageRating) * 10) / 10
    : null;
  return { available: reviewCount > 0, averageRating, reviewCount };
}

function toPublicAccommodationResponse(accommodation, ratingSummary) {
  const normalizedRatingSummary = normalizeRatingSummary(ratingSummary);
  return {
    id: String(accommodation._id),
    name: accommodation.name,
    description: accommodation.description,
    accommodationType: accommodation.accommodationType,
    genderType: accommodation.genderType,
    suitableFor: accommodation.suitableFor || '',
    location: {
      state: accommodation.location?.state || '',
      district: accommodation.location?.district || '',
      city: accommodation.location?.city || '',
      locality: accommodation.location?.locality || '',
      fullAddress: accommodation.location?.fullAddress || '',
      landmark: accommodation.location?.landmark || '',
      googleMapsLink: accommodation.location?.googleMapsLink || '',
    },
    pricing: {
      monthlyRent: accommodation.pricing?.monthlyRent ?? null,
      securityDeposit: accommodation.pricing?.securityDeposit ?? 0,
      electricityCharges: accommodation.pricing?.electricityCharges ?? 0,
      waterCharges: accommodation.pricing?.waterCharges ?? 0,
      foodCharges: accommodation.pricing?.foodCharges ?? 0,
      otherCharges: accommodation.pricing?.otherCharges ?? 0,
      includedChargesInfo: accommodation.pricing?.includedChargesInfo || '',
      extraChargesInfo: accommodation.pricing?.extraChargesInfo || '',
    },
    roomDetails: {
      roomType: accommodation.roomDetails?.roomType || '',
      totalRooms: accommodation.roomDetails?.totalRooms ?? 0,
      availableRoomsOrBeds: accommodation.roomDetails?.availableRoomsOrBeds ?? 0,
      bathroomType: accommodation.roomDetails?.bathroomType || '',
      furnishing: accommodation.roomDetails?.furnishing || '',
    },
    foodInfo: {
      foodProvided: Boolean(accommodation.foodInfo?.foodProvided),
      selfCookingAllowed: Boolean(accommodation.foodInfo?.selfCookingAllowed),
      homeFoodDeliveryAllowed: Boolean(accommodation.foodInfo?.homeFoodDeliveryAllowed),
    },
    facilities: Array.isArray(accommodation.facilities) ? accommodation.facilities : [],
    rules: {
      entryTiming: accommodation.rules?.entryTiming || '',
      visitorRules: accommodation.rules?.visitorRules || '',
      additionalRules: accommodation.rules?.additionalRules || '',
    },
    availability: {
      status: accommodation.availability?.status || '',
      availableBeds: accommodation.availability?.availableBeds ?? 0,
      availableFrom: accommodation.availability?.availableFrom || null,
    },
    contact: {
      ownerDisplayName: accommodation.contact?.ownerDisplayName || '',
      contactNumber: accommodation.contact?.contactNumber || '',
    },
    photos: sanitizePhotoArrayForResponse(accommodation.photos, accommodation._id),
    ratingSummary: normalizedRatingSummary,
    averageRating: normalizedRatingSummary.averageRating,
    reviewCount: normalizedRatingSummary.reviewCount,
    isDemo: Boolean(accommodation.isDemo),
    createdAt: accommodation.createdAt,
    updatedAt: accommodation.updatedAt,
  };
}

function matchesContains(value, needle) {
  if (!needle) return true;
  return String(value || '').toLowerCase().includes(String(needle).toLowerCase());
}

function buildAndFilter(query) {
  validateSupportedQueryParams(query);

  const city = parseSafeSearchString(query.city, 'city', { maxLength: 100 });
  const locality = parseSafeSearchString(query.locality, 'locality', { maxLength: 100 });
  const suitableFor = parseSafeSearchString(query.suitableFor, 'suitableFor', { maxLength: 100 });
  const minRent = parseNonNegativeNumber(query.minRent, 'minRent');
  const maxRent = parseNonNegativeNumber(query.maxRent, 'maxRent');
  const accommodationType = parseEnum(query.accommodationType, 'accommodationType', ACCOMMODATION_TYPES);
  const genderType = parseEnum(query.genderType, 'genderType', GENDER_TYPES);
  const roomType = parseEnum(query.roomType, 'roomType', ROOM_TYPES);
  const foodProvided = parseBooleanQuery(query.foodProvided, 'foodProvided');
  const selfCookingAllowed = parseBooleanQuery(query.selfCookingAllowed, 'selfCookingAllowed');
  const homeFoodDeliveryAllowed = parseBooleanQuery(query.homeFoodDeliveryAllowed, 'homeFoodDeliveryAllowed');
  const availability = parseEnum(query.availability, 'availability', AVAILABILITY_STATUS);

  if (minRent !== undefined && maxRent !== undefined && minRent > maxRent) {
    throw new ApiError(400, 'Validation failed', [{ field: 'minRent', message: 'minRent cannot be greater than maxRent' }]);
  }
  if (availability !== undefined && availability !== AVAILABILITY_STATUS.AVAILABLE) {
    throw new ApiError(400, 'Validation failed', [{ field: 'availability', message: 'Only availability=Available is supported for public search' }]);
  }

  return (a) => {
    if (a.status !== ACCOMMODATION_STATUS.APPROVED) return false;
    if ((a.availability?.status || '') !== AVAILABILITY_STATUS.AVAILABLE) return false;
    if (city && !matchesContains(a.location?.city, city)) return false;
    if (locality && !matchesContains(a.location?.locality, locality)) return false;
    if (suitableFor && !matchesContains(a.suitableFor, suitableFor)) return false;
    const rent = Number(a.pricing?.monthlyRent);
    if (minRent !== undefined && !(Number.isFinite(rent) && rent >= minRent)) return false;
    if (maxRent !== undefined && !(Number.isFinite(rent) && rent <= maxRent)) return false;
    if (accommodationType && a.accommodationType !== accommodationType) return false;
    if (genderType && a.genderType !== genderType) return false;
    if (roomType && (a.roomDetails?.roomType || '') !== roomType) return false;
    if (foodProvided !== undefined && Boolean(a.foodInfo?.foodProvided) !== foodProvided) return false;
    if (selfCookingAllowed !== undefined && Boolean(a.foodInfo?.selfCookingAllowed) !== selfCookingAllowed) return false;
    if (homeFoodDeliveryAllowed !== undefined && Boolean(a.foodInfo?.homeFoodDeliveryAllowed) !== homeFoodDeliveryAllowed) return false;
    return true;
  };
}

function compareDatesDesc(a, b) {
  return new Date(b || 0).getTime() - new Date(a || 0).getTime();
}

const getPublicAccommodations = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 'page', { defaultValue: 1, min: 1, max: 10000 });
  const limit = parsePositiveInt(req.query.limit, 'limit', { defaultValue: 10, min: 1, max: 50 });
  const { sortBy } = buildSort(req.query);
  const predicate = buildAndFilter(req.query);

  const { accommodations } = getCollections();
  let items = accommodations.filter(predicate);

  // Rating summaries for sorting and response
  const ratingMap = getReviewAggregatesByAccommodationIds(items.map((a) => a._id));

  if (sortBy === 'rating_desc' || sortBy === 'rating_asc') {
    const dir = sortBy === 'rating_desc' ? -1 : 1;
    items = items.slice().sort((a, b) => {
      const ra = ratingMap.get(String(a._id)) || buildEmptyRatingSummary();
      const rb = ratingMap.get(String(b._id)) || buildEmptyRatingSummary();
      const ha = ra.reviewCount > 0 ? 1 : 0;
      const hb = rb.reviewCount > 0 ? 1 : 0;
      if (ha !== hb) return hb - ha; // rated before unrated in both directions
      const ava = ra.averageRating === null ? (dir === -1 ? -Infinity : Infinity) : ra.averageRating;
      const avb = rb.averageRating === null ? (dir === -1 ? -Infinity : Infinity) : rb.averageRating;
      if (ava !== avb) return dir === -1 ? avb - ava : ava - avb;
      if (ra.reviewCount !== rb.reviewCount) return dir === -1 ? rb.reviewCount - ra.reviewCount : ra.reviewCount - rb.reviewCount;
      return compareDatesDesc(a.createdAt, b.createdAt);
    });
  } else if (sortBy === 'rent_asc') {
    items = items.slice().sort((a, b) => (Number(a.pricing?.monthlyRent) - Number(b.pricing?.monthlyRent)) || compareDatesDesc(a.createdAt, b.createdAt));
  } else if (sortBy === 'rent_desc') {
    items = items.slice().sort((a, b) => (Number(b.pricing?.monthlyRent) - Number(a.pricing?.monthlyRent)) || compareDatesDesc(a.createdAt, b.createdAt));
  } else if (sortBy === 'oldest') {
    items = items.slice().sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  } else {
    // newest default
    items = items.slice().sort((a, b) => compareDatesDesc(a.createdAt, b.createdAt));
  }

  const totalResults = items.length;
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);
  const skip = (page - 1) * limit;
  const paged = items.slice(skip, skip + limit);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Public accommodations retrieved successfully',
    data: {
      accommodations: paged.map((acc) => toPublicAccommodationResponse(acc, ratingMap.get(String(acc._id)) || buildEmptyRatingSummary())),
      pagination: {
        totalResults,
        currentPage: page,
        totalPages,
        limit,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPrevPage: page > 1 && totalResults > 0,
      },
      sortBy,
      filtersApplied: {
        status: ACCOMMODATION_STATUS.APPROVED,
        availability: AVAILABILITY_STATUS.AVAILABLE,
      },
      ratingAggregation: {
        derivedFrom: 'eligible reviews only',
        eligibleModerationStatuses: PUBLIC_REVIEW_MODERATION_STATUSES,
        policy: 'Reviews with moderationStatus none/approved are included. Removed reviews are excluded. Reported reviews are not automatically treated as misconduct; moderation decisions determine visibility.',
      },
    },
  });
});

const getPublicAccommodationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid accommodation ID');

  const { accommodations } = getCollections();
  const accommodation = accommodations.find((a) => sameId(a._id, id));
  if (!accommodation || accommodation.status !== ACCOMMODATION_STATUS.APPROVED || accommodation.availability?.status !== AVAILABILITY_STATUS.AVAILABLE) {
    throw new ApiError(404, 'Accommodation not found');
  }

  const ratingSummary = getReviewAggregateForAccommodation(accommodation._id);
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation details retrieved successfully',
    data: {
      accommodation: toPublicAccommodationResponse(accommodation, ratingSummary),
      ratingAggregation: {
        derivedFrom: 'eligible reviews only',
        eligibleModerationStatuses: PUBLIC_REVIEW_MODERATION_STATUSES,
        policy: 'Reviews with moderationStatus none/approved are included. Removed reviews are excluded. Reported reviews are not automatically treated as misconduct; moderation decisions determine visibility.',
      },
    },
  });
});

module.exports = { getPublicAccommodations, getPublicAccommodationById };
