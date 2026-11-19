const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { Student, Accommodation } = require('../models');
const { ACCOMMODATION_STATUS } = require('../utils/constants');
const { isValidObjectId, trimString, isNonEmptyString } = require('../utils/validators');

const ALLOWED_PROFILE_UPDATE_FIELDS = new Set(['name', 'phone']);
const PRIVILEGED_PROFILE_FIELDS = new Set(['email', 'password', 'role', 'isActive', 'isDemo', 'favourites', '_id', 'id']);

function getSafeStudentProfile(studentDoc) {
  if (!studentDoc) return null;
  return {
    id: String(studentDoc._id),
    name: studentDoc.name,
    email: studentDoc.email,
    phone: studentDoc.phone || '',
    role: studentDoc.role,
    isActive: Boolean(studentDoc.isActive),
    isDemo: Boolean(studentDoc.isDemo),
    favouritesCount: Array.isArray(studentDoc.favourites) ? studentDoc.favourites.length : 0,
    createdAt: studentDoc.createdAt,
    updatedAt: studentDoc.updatedAt,
  };
}

function sanitizeFavouriteAccommodation(accommodationDoc) {
  if (!accommodationDoc) return null;
  // Safe summary for student's own favourites list (no private owner account fields)
  return {
    id: String(accommodationDoc._id),
    name: accommodationDoc.name,
    description: accommodationDoc.description,
    accommodationType: accommodationDoc.accommodationType,
    genderType: accommodationDoc.genderType,
    suitableFor: accommodationDoc.suitableFor || '',
    location: {
      state: accommodationDoc.location?.state || '',
      district: accommodationDoc.location?.district || '',
      city: accommodationDoc.location?.city || '',
      locality: accommodationDoc.location?.locality || '',
      landmark: accommodationDoc.location?.landmark || '',
      googleMapsLink: accommodationDoc.location?.googleMapsLink || '',
    },
    pricing: {
      monthlyRent: accommodationDoc.pricing?.monthlyRent ?? null,
      securityDeposit: accommodationDoc.pricing?.securityDeposit ?? 0,
      electricityCharges: accommodationDoc.pricing?.electricityCharges ?? 0,
      waterCharges: accommodationDoc.pricing?.waterCharges ?? 0,
      foodCharges: accommodationDoc.pricing?.foodCharges ?? 0,
      otherCharges: accommodationDoc.pricing?.otherCharges ?? 0,
    },
    roomDetails: {
      roomType: accommodationDoc.roomDetails?.roomType || '',
      availableRoomsOrBeds: accommodationDoc.roomDetails?.availableRoomsOrBeds ?? 0,
      bathroomType: accommodationDoc.roomDetails?.bathroomType || '',
      furnishing: accommodationDoc.roomDetails?.furnishing || '',
    },
    foodInfo: accommodationDoc.foodInfo || {},
    facilities: Array.isArray(accommodationDoc.facilities) ? accommodationDoc.facilities : [],
    availability: accommodationDoc.availability || {},
    photos: Array.isArray(accommodationDoc.photos) ? accommodationDoc.photos : [],
    status: accommodationDoc.status,
    isDemo: Boolean(accommodationDoc.isDemo),
    createdAt: accommodationDoc.createdAt,
    updatedAt: accommodationDoc.updatedAt,
  };
}

const getProfile = asyncHandler(async (req, res) => {
  const studentId = req.auth.id;
  const student = await Student.findById(studentId);

  if (!student) {
    throw new ApiError(404, 'Student account not found');
  }

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Student profile retrieved successfully',
    data: { profile: getSafeStudentProfile(student) },
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const studentId = req.auth.id;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const keys = Object.keys(body);

  if (keys.length === 0) {
    throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'At least one updatable field is required' }]);
  }

  const errors = [];
  const updates = {};

  for (const key of keys) {
    if (PRIVILEGED_PROFILE_FIELDS.has(key)) {
      errors.push({ field: key, message: `${key} cannot be updated through this endpoint` });
      continue;
    }
    if (!ALLOWED_PROFILE_UPDATE_FIELDS.has(key)) {
      errors.push({ field: key, message: `${key} is not a valid profile field` });
      continue;
    }

    if (key === 'name') {
      const name = trimString(body.name);
      if (!isNonEmptyString(name)) {
        errors.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (name.length < 2 || name.length > 100) {
        errors.push({ field: 'name', message: 'Name must be between 2 and 100 characters' });
      } else {
        updates.name = name;
      }
    }

    if (key === 'phone') {
      const phone = body.phone === undefined || body.phone === null ? '' : trimString(body.phone);
      if (phone && (phone.length < 7 || phone.length > 20)) {
        errors.push({ field: 'phone', message: 'Phone number must be between 7 and 20 characters' });
      } else {
        updates.phone = phone;
      }
    }
  }

  if (errors.length) {
    throw new ApiError(400, 'Validation failed', errors);
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'No valid profile fields provided for update' }]);
  }

  const student = await Student.findById(studentId);
  if (!student) {
    throw new ApiError(404, 'Student account not found');
  }

  Object.assign(student, updates);
  await student.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Student profile updated successfully',
    data: { profile: getSafeStudentProfile(student) },
  });
});

const getFavourites = asyncHandler(async (req, res) => {
  const studentId = req.auth.id;
  const student = await Student.findById(studentId).populate('favourites');

  if (!student) {
    throw new ApiError(404, 'Student account not found');
  }

  const favourites = (Array.isArray(student.favourites) ? student.favourites : [])
    .filter(Boolean) // handles deleted accommodation references safely
    .map(sanitizeFavouriteAccommodation)
    .filter(Boolean);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Favourites retrieved successfully',
    data: {
      favourites,
      count: favourites.length,
    },
  });
});

const addFavourite = asyncHandler(async (req, res) => {
  const studentId = req.auth.id;
  const { accommodationId } = req.params;

  if (!isValidObjectId(accommodationId)) {
    throw new ApiError(400, 'Invalid accommodation ID');
  }

  const [student, accommodation] = await Promise.all([
    Student.findById(studentId),
    Accommodation.findById(accommodationId),
  ]);

  if (!student) {
    throw new ApiError(404, 'Student account not found');
  }

  if (!accommodation) {
    throw new ApiError(404, 'Accommodation not found');
  }

  // Only eligible approved accommodations can be favourited
  if (accommodation.status !== ACCOMMODATION_STATUS.APPROVED) {
    throw new ApiError(403, 'Only approved accommodations can be added to favourites');
  }

  const alreadyFavourited = (student.favourites || []).some(
    (favId) => String(favId) === String(accommodation._id)
  );
  if (alreadyFavourited) {
    throw new ApiError(409, 'Accommodation is already in favourites');
  }

  student.favourites.push(accommodation._id);
  await student.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation added to favourites successfully',
    data: {
      accommodationId: String(accommodation._id),
      favouritesCount: student.favourites.length,
    },
  });
});

const removeFavourite = asyncHandler(async (req, res) => {
  const studentId = req.auth.id;
  const { accommodationId } = req.params;

  if (!isValidObjectId(accommodationId)) {
    throw new ApiError(400, 'Invalid accommodation ID');
  }

  const student = await Student.findById(studentId);
  if (!student) {
    throw new ApiError(404, 'Student account not found');
  }

  const beforeCount = (student.favourites || []).length;
  student.favourites = (student.favourites || []).filter(
    (favId) => String(favId) !== String(accommodationId)
  );

  if (student.favourites.length === beforeCount) {
    throw new ApiError(404, 'Accommodation is not in favourites');
  }

  await student.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodation removed from favourites successfully',
    data: {
      accommodationId: String(accommodationId),
      favouritesCount: student.favourites.length,
    },
  });
});

module.exports = {
  getProfile,
  updateProfile,
  getFavourites,
  addFavourite,
  removeFavourite,
  getSafeStudentProfile,
  sanitizeFavouriteAccommodation,
};
