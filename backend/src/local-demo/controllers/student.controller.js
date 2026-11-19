const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const { ACCOMMODATION_STATUS, AVAILABILITY_STATUS } = require('../../utils/constants');
const { isValidObjectId, trimString, isNonEmptyString } = require('../../utils/validators');
const { withWriteLock, getCollections } = require('../store');
const { sameId, isValidId } = require('../ids');
const { safeStudent, nowIso } = require('../utils/storeHelpers');

const ALLOWED_PROFILE_UPDATE_FIELDS = new Set(['name', 'phone']);
const PRIVILEGED_PROFILE_FIELDS = new Set(['email', 'password', 'passwordHash', 'role', 'isActive', 'isDemo', 'favourites', '_id', 'id']);

function sanitizeFavouriteAccommodation(accommodation) {
  if (!accommodation) return null;
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
      landmark: accommodation.location?.landmark || '',
      googleMapsLink: accommodation.location?.googleMapsLink || '',
    },
    pricing: {
      monthlyRent: accommodation.pricing?.monthlyRent ?? null,
      securityDeposit: accommodation.pricing?.securityDeposit ?? 0,
    },
    roomDetails: {
      roomType: accommodation.roomDetails?.roomType || '',
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
    availability: {
      status: accommodation.availability?.status || '',
      availableBeds: accommodation.availability?.availableBeds ?? 0,
      availableFrom: accommodation.availability?.availableFrom || null,
    },
    photos: Array.isArray(accommodation.photos)
      ? accommodation.photos.filter((p) => p.deletionStatus !== 'pending_deletion').map((p) => ({ url: p.secureUrl || p.url || '', secureUrl: p.secureUrl || p.url || '', publicId: p.publicId || '', id: p._id || p.id }))
      : [],
    status: accommodation.status,
    isDemo: Boolean(accommodation.isDemo),
    createdAt: accommodation.createdAt,
    updatedAt: accommodation.updatedAt,
  };
}

const getProfile = asyncHandler(async (req, res) => {
  const { students } = getCollections();
  const student = students.find((s) => sameId(s._id, req.auth.id));
  if (!student) throw new ApiError(404, 'Student account not found');
  return sendSuccess(res, { statusCode: 200, message: 'Profile retrieved successfully', data: { user: safeStudent(student) } });
});

const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const errors = [];
  const updates = {};

  for (const key of Object.keys(body)) {
    if (PRIVILEGED_PROFILE_FIELDS.has(key)) {
      errors.push({ field: key, message: `${key} cannot be updated from this endpoint` });
    } else if (!ALLOWED_PROFILE_UPDATE_FIELDS.has(key)) {
      errors.push({ field: key, message: `${key} is not an updatable profile field` });
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = trimString(body.name);
    if (!isNonEmptyString(name)) errors.push({ field: 'name', message: 'Name is required' });
    else updates.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
    const phone = body.phone === undefined || body.phone === null ? '' : trimString(body.phone);
    if (phone && (phone.length < 7 || phone.length > 20)) {
      errors.push({ field: 'phone', message: 'Phone number must be between 7 and 20 characters' });
    } else {
      updates.phone = phone;
    }
  }

  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'No valid profile fields provided for update', [{ field: 'body', message: 'Provide at least one of: name, phone' }]);
  }

  await withWriteLock(async (state) => {
    const student = state.students.find((s) => sameId(s._id, req.auth.id));
    if (!student) throw new ApiError(404, 'Student account not found');
    Object.assign(student, updates);
    student.updatedAt = nowIso();
  });

  const student = getCollections().students.find((s) => sameId(s._id, req.auth.id));
  return sendSuccess(res, { statusCode: 200, message: 'Profile updated successfully', data: { user: safeStudent(student) } });
});

const getFavourites = asyncHandler(async (req, res) => {
  const { students, accommodations } = getCollections();
  const student = students.find((s) => sameId(s._id, req.auth.id));
  if (!student) throw new ApiError(404, 'Student account not found');

  const favIds = Array.isArray(student.favourites) ? student.favourites.map(String) : [];
  const favourites = favIds
    .map((id) => accommodations.find((a) => sameId(a._id, id)))
    .filter(Boolean)
    .filter((a) => a.status === ACCOMMODATION_STATUS.APPROVED && a.availability?.status === AVAILABILITY_STATUS.AVAILABLE)
    .map(sanitizeFavouriteAccommodation);

  // Clean stale/ineligible favourites? keep persisted as-is but response shows valid ones; better to preserve data.
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Favourites retrieved successfully',
    data: { favourites, count: favourites.length },
  });
});

const addFavourite = asyncHandler(async (req, res) => {
  const { accommodationId } = req.params;
  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');

  await withWriteLock(async (state) => {
    const student = state.students.find((s) => sameId(s._id, req.auth.id));
    if (!student) throw new ApiError(404, 'Student account not found');
    const accommodation = state.accommodations.find((a) => sameId(a._id, accommodationId));
    if (!accommodation) throw new ApiError(404, 'Accommodation not found');
    if (accommodation.status !== ACCOMMODATION_STATUS.APPROVED || accommodation.availability?.status !== AVAILABILITY_STATUS.AVAILABLE) {
      throw new ApiError(404, 'Accommodation not found');
    }
    student.favourites = Array.isArray(student.favourites) ? student.favourites : [];
    if (!student.favourites.some((id) => sameId(id, accommodationId))) {
      student.favourites.push(String(accommodationId));
      student.updatedAt = nowIso();
    }
  });

  const student = getCollections().students.find((s) => sameId(s._id, req.auth.id));
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation added to favourites',
    data: { favouritesCount: Array.isArray(student.favourites) ? student.favourites.length : 0 },
  });
});

const removeFavourite = asyncHandler(async (req, res) => {
  const { accommodationId } = req.params;
  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');

  await withWriteLock(async (state) => {
    const student = state.students.find((s) => sameId(s._id, req.auth.id));
    if (!student) throw new ApiError(404, 'Student account not found');
    const before = Array.isArray(student.favourites) ? student.favourites.length : 0;
    student.favourites = (Array.isArray(student.favourites) ? student.favourites : []).filter((id) => !sameId(id, accommodationId));
    if (student.favourites.length !== before) student.updatedAt = nowIso();
  });

  const student = getCollections().students.find((s) => sameId(s._id, req.auth.id));
  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation removed from favourites',
    data: { favouritesCount: Array.isArray(student.favourites) ? student.favourites.length : 0 },
  });
});

module.exports = { getProfile, updateProfile, getFavourites, addFavourite, removeFavourite };
