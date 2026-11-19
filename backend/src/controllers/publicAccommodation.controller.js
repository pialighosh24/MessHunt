const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { Accommodation } = require('../models');
const {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  AVAILABILITY_STATUS,
} = require('../utils/constants');
const { isValidObjectId } = require('../utils/validators');
const { sanitizePhotoArrayForResponse } = require('../utils/uploadValidation');
const {
  PUBLIC_REVIEW_MODERATION_STATUSES,
  buildEmptyRatingSummary,
  getReviewAggregatesByAccommodationIds,
  getReviewAggregateForAccommodation,
} = require('../utils/reviewAggregation');

const SUPPORTED_QUERY_PARAMS = new Set([
  'page',
  'limit',
  'sort', // alias supported for convenience
  'sortBy',
  'city',
  'locality',
  'minRent',
  'maxRent',
  'accommodationType',
  'genderType',
  'suitableFor',
  'roomType',
  'foodProvided',
  'selfCookingAllowed',
  'homeFoodDeliveryAllowed',
  'availability',
]);

const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  rent_asc: { 'pricing.monthlyRent': 1, createdAt: -1 },
  rent_desc: { 'pricing.monthlyRent': -1, createdAt: -1 },
  // rating sorts handled via aggregation pipeline
  rating_desc: 'rating_desc',
  rating_asc: 'rating_asc',
  rating: 'rating_desc', // alias
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  const sort = SORT_OPTIONS[normalized];
  if (!sort) {
    throw new ApiError(400, 'Validation failed', [{
      field: 'sortBy',
      message: `sortBy must be one of: ${Object.keys(SORT_OPTIONS).join(', ')}`,
    }]);
  }
  return { sort, sortBy: normalized === 'rating' ? 'rating_desc' : normalized };
}

function buildPublicAccommodationFilter(query) {
  validateSupportedQueryParams(query);

  // Base public visibility rules:
  // - approved only
  // - exclude unavailable/full listings from default public search
  const filter = {
    status: ACCOMMODATION_STATUS.APPROVED,
    'availability.status': AVAILABILITY_STATUS.AVAILABLE,
  };

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
    // Public endpoints only return publicly available listings.
    throw new ApiError(400, 'Validation failed', [{
      field: 'availability',
      message: 'Only availability=Available is supported for public search',
    }]);
  }

  // Safe string matching: escape regex metacharacters and use anchored-insensitive contains match.
  if (city) filter['location.city'] = { $regex: escapeRegex(city), $options: 'i' };
  if (locality) filter['location.locality'] = { $regex: escapeRegex(locality), $options: 'i' };
  if (suitableFor) filter.suitableFor = { $regex: escapeRegex(suitableFor), $options: 'i' };

  if (minRent !== undefined || maxRent !== undefined) {
    filter['pricing.monthlyRent'] = {};
    if (minRent !== undefined) filter['pricing.monthlyRent'].$gte = minRent;
    if (maxRent !== undefined) filter['pricing.monthlyRent'].$lte = maxRent;
  }

  if (accommodationType) filter.accommodationType = accommodationType;
  if (genderType) filter.genderType = genderType;
  if (roomType) filter['roomDetails.roomType'] = roomType;
  if (foodProvided !== undefined) filter['foodInfo.foodProvided'] = foodProvided;
  if (selfCookingAllowed !== undefined) filter['foodInfo.selfCookingAllowed'] = selfCookingAllowed;
  if (homeFoodDeliveryAllowed !== undefined) filter['foodInfo.homeFoodDeliveryAllowed'] = homeFoodDeliveryAllowed;

  return filter;
}

function normalizeRatingSummary(summary) {
  if (!summary) return buildEmptyRatingSummary();
  const reviewCount = Number(summary.reviewCount || 0);
  const averageRating = reviewCount > 0 && summary.averageRating !== null && summary.averageRating !== undefined
    ? Math.round(Number(summary.averageRating) * 10) / 10
    : null;
  return {
    available: reviewCount > 0,
    averageRating,
    reviewCount,
  };
}

function toPublicAccommodationResponse(accommodationDoc, ratingSummary) {
  // Public serializer (separate from owner-facing serializer): only safe, approved-public fields.
  // Includes listing contact info for approved public listings, but never private owner account data.
  const obj = accommodationDoc.toObject ? accommodationDoc.toObject() : accommodationDoc;
  const normalizedRatingSummary = normalizeRatingSummary(ratingSummary || obj.ratingSummary);
  return {
    id: String(obj._id),
    name: obj.name,
    description: obj.description,
    accommodationType: obj.accommodationType,
    genderType: obj.genderType,
    suitableFor: obj.suitableFor || '',
    location: {
      state: obj.location?.state || '',
      district: obj.location?.district || '',
      city: obj.location?.city || '',
      locality: obj.location?.locality || '',
      fullAddress: obj.location?.fullAddress || '',
      landmark: obj.location?.landmark || '',
      googleMapsLink: obj.location?.googleMapsLink || '',
    },
    pricing: {
      monthlyRent: obj.pricing?.monthlyRent ?? null,
      securityDeposit: obj.pricing?.securityDeposit ?? 0,
      electricityCharges: obj.pricing?.electricityCharges ?? 0,
      waterCharges: obj.pricing?.waterCharges ?? 0,
      foodCharges: obj.pricing?.foodCharges ?? 0,
      otherCharges: obj.pricing?.otherCharges ?? 0,
      includedChargesInfo: obj.pricing?.includedChargesInfo || '',
      extraChargesInfo: obj.pricing?.extraChargesInfo || '',
    },
    roomDetails: {
      roomType: obj.roomDetails?.roomType || '',
      totalRooms: obj.roomDetails?.totalRooms ?? 0,
      availableRoomsOrBeds: obj.roomDetails?.availableRoomsOrBeds ?? 0,
      bathroomType: obj.roomDetails?.bathroomType || '',
      furnishing: obj.roomDetails?.furnishing || '',
    },
    foodInfo: {
      foodProvided: Boolean(obj.foodInfo?.foodProvided),
      selfCookingAllowed: Boolean(obj.foodInfo?.selfCookingAllowed),
      homeFoodDeliveryAllowed: Boolean(obj.foodInfo?.homeFoodDeliveryAllowed),
    },
    facilities: Array.isArray(obj.facilities) ? obj.facilities : [],
    rules: {
      entryTiming: obj.rules?.entryTiming || '',
      visitorRules: obj.rules?.visitorRules || '',
      additionalRules: obj.rules?.additionalRules || '',
    },
    availability: {
      status: obj.availability?.status || '',
      availableBeds: obj.availability?.availableBeds ?? 0,
      availableFrom: obj.availability?.availableFrom || null,
    },
    contact: {
      ownerDisplayName: obj.contact?.ownerDisplayName || '',
      contactNumber: obj.contact?.contactNumber || '',
    },
    photos: sanitizePhotoArrayForResponse(obj.photos, obj._id),
    ratingSummary: normalizedRatingSummary,
    averageRating: normalizedRatingSummary.averageRating, // convenience field
    reviewCount: normalizedRatingSummary.reviewCount,     // convenience field
    isDemo: Boolean(obj.isDemo),
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

function buildRatingSortPipelineStages(sortBy) {
  const isDesc = sortBy === 'rating_desc' || sortBy === 'rating';
  return [
    {
      $lookup: {
        from: 'reviews',
        let: { accommodationId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$accommodation', '$$accommodationId'] },
              moderationStatus: { $in: PUBLIC_REVIEW_MODERATION_STATUSES },
            },
          },
          {
            $group: {
              _id: '$accommodation',
              averageRating: { $avg: '$rating' },
              reviewCount: { $sum: 1 },
            },
          },
        ],
        as: '_ratingAgg',
      },
    },
    {
      $addFields: {
        _ratingAgg: { $first: '$_ratingAgg' },
      },
    },
    {
      $addFields: {
        reviewCount: { $ifNull: ['$_ratingAgg.reviewCount', 0] },
        averageRating: {
          $cond: [
            { $gt: [{ $ifNull: ['$_ratingAgg.reviewCount', 0] }, 0] },
            { $round: ['$_ratingAgg.averageRating', 1] },
            null,
          ],
        },
        _hasRatings: { $gt: [{ $ifNull: ['$_ratingAgg.reviewCount', 0] }, 0] },
      },
    },
    {
      $sort: isDesc
        ? { _hasRatings: -1, averageRating: -1, reviewCount: -1, createdAt: -1 }
        : { _hasRatings: -1, averageRating: 1, reviewCount: 1, createdAt: -1 },
    },
  ];
}

function stripAggregationMeta(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { _ratingAgg, _hasRatings, ...rest } = doc;
  return rest;
}

const getPublicAccommodations = asyncHandler(async (req, res) => {
  const page = parsePositiveInt(req.query.page, 'page', { defaultValue: 1, min: 1, max: 10000 });
  const limit = parsePositiveInt(req.query.limit, 'limit', { defaultValue: 10, min: 1, max: 50 });
  const { sort, sortBy } = buildSort(req.query);
  const filter = buildPublicAccommodationFilter(req.query);
  const skip = (page - 1) * limit;

  let accommodations = [];
  let totalResults = 0;

  if (sortBy === 'rating_desc' || sortBy === 'rating_asc') {
    // Rating-based sorting requires aggregation from eligible reviews.
    // Accommodations with no eligible ratings are placed after rated accommodations (consistent in both directions).
    const pipeline = [
      { $match: filter },
      ...buildRatingSortPipelineStages(sortBy),
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const aggResult = await Accommodation.aggregate(pipeline);
    const facet = Array.isArray(aggResult) && aggResult[0] ? aggResult[0] : { items: [], total: [] };
    accommodations = Array.isArray(facet.items) ? facet.items.map(stripAggregationMeta) : [];
    totalResults = Array.isArray(facet.total) && facet.total[0] ? Number(facet.total[0].count || 0) : 0;
  } else {
    [accommodations, totalResults] = await Promise.all([
      Accommodation.find(filter).sort(sort).skip(skip).limit(limit),
      Accommodation.countDocuments(filter),
    ]);
  }

  // Attach real rating summaries derived from eligible reviews only.
  const ids = accommodations.map((a) => String(a._id));
  const ratingMap = await getReviewAggregatesByAccommodationIds(ids);

  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Public accommodations retrieved successfully',
    data: {
      accommodations: accommodations.map((acc) => {
        const id = String(acc._id);
        const computed = ratingMap.get(id) || buildEmptyRatingSummary();
        // For rating-sorted aggregation results, prefer computed values already present.
        const ratingSummary = acc.reviewCount !== undefined || acc.averageRating !== undefined
          ? normalizeRatingSummary({ averageRating: acc.averageRating, reviewCount: acc.reviewCount })
          : computed;
        return toPublicAccommodationResponse(acc, ratingSummary);
      }),
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
        // Reflect effective public constraints for clarity
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
  if (!isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid accommodation ID');
  }

  const accommodation = await Accommodation.findOne({
    _id: id,
    status: ACCOMMODATION_STATUS.APPROVED,
    'availability.status': AVAILABILITY_STATUS.AVAILABLE,
  });

  if (!accommodation) {
    // 404 for pending, rejected, deleted, unavailable/full, or non-existent listings
    throw new ApiError(404, 'Accommodation not found');
  }

  const ratingSummary = await getReviewAggregateForAccommodation(accommodation._id);

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

module.exports = {
  getPublicAccommodations,
  getPublicAccommodationById,
  toPublicAccommodationResponse,
  buildPublicAccommodationFilter,
};
