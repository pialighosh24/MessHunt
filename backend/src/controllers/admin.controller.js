const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { Student, Owner, Admin, Accommodation, Review } = require('../models');
const {
  ACCOMMODATION_STATUS,
  MODERATION_STATUS,
  AVAILABILITY_STATUS,
} = require('../utils/constants');
const { isValidObjectId, trimString, isValidUrl } = require('../utils/validators');
const { sanitizePhotoArrayForResponse } = require('../utils/uploadValidation');

const STUDENT_LIST_QUERY_PARAMS = new Set(['page', 'limit', 'search', 'isActive', 'isDemo']);
const OWNER_LIST_QUERY_PARAMS = new Set(['page', 'limit', 'search', 'isActive', 'isVerified', 'isDemo']);
const ACCOMMODATION_LIST_QUERY_PARAMS = new Set(['page', 'limit', 'status', 'search', 'city', 'locality', 'ownerId', 'isDemo']);
const REVIEW_LIST_QUERY_PARAMS = new Set(['page', 'limit', 'status', 'reported', 'accommodationId', 'studentId', 'isDemo']);

function parsePagination(query = {}, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const pageRaw = query.page === undefined || query.page === '' ? '1' : String(query.page);
  const limitRaw = query.limit === undefined || query.limit === '' ? String(defaultLimit) : String(query.limit);
  if (!/^\d+$/.test(pageRaw)) throw new ApiError(400, 'Validation failed', [{ field: 'page', message: 'page must be a valid integer' }]);
  if (!/^\d+$/.test(limitRaw)) throw new ApiError(400, 'Validation failed', [{ field: 'limit', message: 'limit must be a valid integer' }]);
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (page < 1 || page > 10000) throw new ApiError(400, 'Validation failed', [{ field: 'page', message: 'page must be between 1 and 10000' }]);
  if (limit < 1 || limit > maxLimit) throw new ApiError(400, 'Validation failed', [{ field: 'limit', message: `limit must be between 1 and ${maxLimit}` }]);
  return { page, limit, skip: (page - 1) * limit };
}

function parseBooleanQuery(value, fieldName) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a boolean value (true/false)` }]);
}

function ensureSupportedQueryParams(query, allowedSet) {
  const unsupported = Object.keys(query || {}).filter((k) => !allowedSet.has(k));
  if (unsupported.length > 0) {
    throw new ApiError(400, 'Validation failed', unsupported.map((field) => ({ field, message: `${field} is not a supported query parameter` })));
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSearch(query, fieldName = 'search', { maxLength = 100 } = {}) {
  const value = query[fieldName];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a string` }]);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be at most ${maxLength} characters` }]);
  return trimmed;
}

function paginationMeta(totalResults, page, limit) {
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);
  return {
    totalResults,
    currentPage: page,
    totalPages,
    limit,
    hasNextPage: totalPages > 0 && page < totalPages,
    hasPrevPage: page > 1 && totalResults > 0,
  };
}

function ensureNoUnsupportedBodyFields(body, allowedFields) {
  const allowed = new Set(allowedFields);
  const errors = [];
  for (const key of Object.keys(body || {})) {
    if (!allowed.has(key)) {
      errors.push({ field: key, message: `${key} is not allowed` });
    }
  }
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
}

function toSafeStudentAdminView(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    name: obj.name || '',
    email: obj.email || '',
    phone: obj.phone || '',
    role: obj.role || 'student',
    isActive: Boolean(obj.isActive),
    isDemo: Boolean(obj.isDemo),
    favouritesCount: Array.isArray(obj.favourites) ? obj.favourites.length : Number(obj.favouritesCount || 0),
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
}

function toSafeOwnerAdminView(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(obj._id),
    name: obj.name || '',
    email: obj.email || '',
    phone: obj.phone || '',
    role: obj.role || 'owner',
    isVerified: Boolean(obj.isVerified),
    isActive: Boolean(obj.isActive),
    isDemo: Boolean(obj.isDemo),
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
}

function toSafeOwnerSummary(owner) {
  if (!owner) return null;
  const obj = owner.toObject ? owner.toObject() : owner;
  return {
    id: String(obj._id),
    name: obj.name || '',
    email: obj.email || '',
    phone: obj.phone || '',
    isVerified: Boolean(obj.isVerified),
    isActive: Boolean(obj.isActive),
    isDemo: Boolean(obj.isDemo),
  };
}

function toAdminAccommodationView(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const owner = obj.owner && typeof obj.owner === 'object' ? toSafeOwnerSummary(obj.owner) : (obj.owner ? String(obj.owner) : null);
  return {
    id: String(obj._id),
    owner,
    name: obj.name || '',
    description: obj.description || '',
    accommodationType: obj.accommodationType || '',
    genderType: obj.genderType || '',
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
    status: obj.status || '',
    rejectionReason: obj.rejectionReason || '',
    approvedAt: obj.approvedAt || null,
    approvedBy: obj.approvedBy ? String(obj.approvedBy) : null,
    rejectedAt: obj.rejectedAt || null,
    rejectedBy: obj.rejectedBy ? String(obj.rejectedBy) : null,
    isDemo: Boolean(obj.isDemo),
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
}

function toSafeStudentSummary(student) {
  if (!student) return null;
  const obj = student.toObject ? student.toObject() : student;
  // Limited info necessary for moderation/admin review; never passwords/auth data
  return {
    id: String(obj._id),
    name: obj.name || '',
    email: obj.email || '',
    isActive: obj.isActive !== undefined ? Boolean(obj.isActive) : undefined,
    isDemo: obj.isDemo !== undefined ? Boolean(obj.isDemo) : undefined,
  };
}

function toAdminReportView(report = {}, index) {
  const obj = report && typeof report.toObject === 'function' ? report.toObject() : report;
  const reporter = obj.student && typeof obj.student === 'object' ? toSafeStudentSummary(obj.student) : (obj.student ? String(obj.student) : null);
  return {
    index,
    reporter,
    reason: obj.reason || '',
    createdAt: obj.createdAt || null,
    status: obj.status || 'pending',
    handledBy: obj.handledBy ? String(obj.handledBy) : null,
    handledAt: obj.handledAt || null,
    handlingNote: obj.handlingNote || '',
  };
}

function toAdminReviewView(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  const student = obj.student && typeof obj.student === 'object' ? toSafeStudentSummary(obj.student) : (obj.student ? String(obj.student) : null);
  const accommodation = obj.accommodation && typeof obj.accommodation === 'object'
    ? { id: String(obj.accommodation._id), name: obj.accommodation.name || '', status: obj.accommodation.status || '' }
    : (obj.accommodation ? String(obj.accommodation) : null);
  const reports = Array.isArray(obj.reports) ? obj.reports.map((r, idx) => toAdminReportView(r, idx)) : [];
  return {
    id: String(obj._id),
    accommodation,
    student,
    rating: obj.rating,
    comment: obj.comment || '',
    reviewerDisplayName: obj.reviewerDisplayName || '',
    isReported: Boolean(obj.isReported),
    reportReason: obj.reportReason || '',
    reports,
    reportCount: reports.length,
    moderationStatus: obj.moderationStatus || MODERATION_STATUS.NONE,
    moderatedAt: obj.moderatedAt || null,
    moderatedBy: obj.moderatedBy ? String(obj.moderatedBy) : null,
    moderationNote: obj.moderationNote || '',
    moderationAction: obj.moderationAction || '',
    previousModerationStatus: obj.previousModerationStatus || '',
    isDemo: Boolean(obj.isDemo),
    createdAt: obj.createdAt || null,
    updatedAt: obj.updatedAt || null,
  };
}

function validateAccommodationForApproval(accommodation) {
  const errors = [];
  const obj = accommodation.toObject ? accommodation.toObject() : accommodation;
  const requiredStringPaths = [
    ['name', 'Accommodation name'],
    ['description', 'Description'],
    ['accommodationType', 'Accommodation type'],
    ['genderType', 'Gender type'],
    ['location.state', 'State'],
    ['location.district', 'District'],
    ['location.city', 'City'],
    ['location.locality', 'Locality'],
    ['location.fullAddress', 'Full address'],
    ['location.googleMapsLink', 'Google Maps link'],
    ['roomDetails.roomType', 'Room type'],
    ['roomDetails.bathroomType', 'Bathroom type'],
    ['contact.ownerDisplayName', 'Owner display name'],
    ['contact.contactNumber', 'Contact number'],
  ];
  const getPath = (o, p) => p.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), o);
  for (const [path, label] of requiredStringPaths) {
    const val = getPath(obj, path);
    if (typeof val !== 'string' || !val.trim()) errors.push({ field: path, message: `${label} is required for approval` });
  }
  const rent = getPath(obj, 'pricing.monthlyRent');
  if (rent === undefined || rent === null || !Number.isFinite(Number(rent)) || Number(rent) < 0) {
    errors.push({ field: 'pricing.monthlyRent', message: 'Valid monthly rent is required for approval' });
  }
  const maps = getPath(obj, 'location.googleMapsLink');
  if (typeof maps === 'string' && maps.trim() && !isValidUrl(maps.trim())) {
    errors.push({ field: 'location.googleMapsLink', message: 'Google Maps link must be a valid URL for approval' });
  }
  return errors;
}

// Dashboard
const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalStudents, demoStudents,
    totalOwners, demoOwners, verifiedOwners, activeVerifiedOwners,
    totalAccommodations, demoAccommodations, pendingAccommodations, approvedAccommodations, rejectedAccommodations,
    totalReviews, demoReviews, pendingModerationReviews, reportedReviews, removedReviews,
  ] = await Promise.all([
    Student.countDocuments({}),
    Student.countDocuments({ isDemo: true }),
    Owner.countDocuments({}),
    Owner.countDocuments({ isDemo: true }),
    Owner.countDocuments({ isVerified: true }),
    Owner.countDocuments({ isVerified: true, isDemo: false }),
    Accommodation.countDocuments({}),
    Accommodation.countDocuments({ isDemo: true }),
    Accommodation.countDocuments({ status: ACCOMMODATION_STATUS.PENDING }),
    Accommodation.countDocuments({ status: ACCOMMODATION_STATUS.APPROVED }),
    Accommodation.countDocuments({ status: ACCOMMODATION_STATUS.REJECTED }),
    Review.countDocuments({}),
    Review.countDocuments({ isDemo: true }),
    Review.countDocuments({ moderationStatus: MODERATION_STATUS.PENDING }),
    Review.countDocuments({ $or: [{ isReported: true }, { 'reports.0': { $exists: true } }] }),
    Review.countDocuments({ moderationStatus: MODERATION_STATUS.REMOVED }),
  ]);

  const unverifiedOwners = Math.max(0, totalOwners - verifiedOwners);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Admin dashboard statistics retrieved successfully',
    data: {
      stats: {
        students: {
          total: totalStudents,
          demo: demoStudents,
          real: Math.max(0, totalStudents - demoStudents),
        },
        owners: {
          total: totalOwners,
          demo: demoOwners,
          real: Math.max(0, totalOwners - demoOwners),
          verified: verifiedOwners,
          unverified: unverifiedOwners,
        },
        accommodations: {
          total: totalAccommodations,
          demo: demoAccommodations,
          real: Math.max(0, totalAccommodations - demoAccommodations),
          pending: pendingAccommodations,
          approved: approvedAccommodations,
          rejected: rejectedAccommodations,
        },
        reviews: {
          total: totalReviews,
          demo: demoReviews,
          real: Math.max(0, totalReviews - demoReviews),
          pendingModeration: pendingModerationReviews,
          reported: reportedReviews,
          removed: removedReviews,
        },
      },
      notes: {
        demoSeparation: 'Stats include demo and real breakdowns where applicable. Counts are derived from actual database records (excluding deleted documents).',
      },
    },
  });
});

// Students
const listStudents = asyncHandler(async (req, res) => {
  ensureSupportedQueryParams(req.query, STUDENT_LIST_QUERY_PARAMS);
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const isActive = parseBooleanQuery(req.query.isActive, 'isActive');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (isDemo !== undefined) filter.isDemo = isDemo;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [students, totalResults] = await Promise.all([
    Student.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Student.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Students retrieved successfully',
    data: {
      students: students.map(toSafeStudentAdminView),
      pagination: paginationMeta(totalResults, page, limit),
    },
  });
});

const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid student ID');
  const student = await Student.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  return sendSuccess(res, { statusCode: 200, message: 'Student retrieved successfully', data: { student: toSafeStudentAdminView(student) } });
});

const updateStudentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid student ID');
  ensureNoUnsupportedBodyFields(req.body, ['isActive']);
  if (typeof req.body?.isActive !== 'boolean') {
    throw new ApiError(400, 'Validation failed', [{ field: 'isActive', message: 'isActive must be true or false' }]);
  }
  const student = await Student.findById(id);
  if (!student) throw new ApiError(404, 'Student not found');
  const previous = { isActive: Boolean(student.isActive) };
  student.isActive = req.body.isActive;
  await student.save();
  return sendSuccess(res, {
    statusCode: 200,
    message: `Student account ${student.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { student: toSafeStudentAdminView(student), audit: { action: 'student_status_update', previous, current: { isActive: Boolean(student.isActive) }, adminId: String(req.auth.id), at: new Date().toISOString() } },
  });
});

// Owners
const listOwners = asyncHandler(async (req, res) => {
  ensureSupportedQueryParams(req.query, OWNER_LIST_QUERY_PARAMS);
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const isActive = parseBooleanQuery(req.query.isActive, 'isActive');
  const isVerified = parseBooleanQuery(req.query.isVerified, 'isVerified');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');

  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (isVerified !== undefined) filter.isVerified = isVerified;
  if (isDemo !== undefined) filter.isDemo = isDemo;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  const [owners, totalResults] = await Promise.all([
    Owner.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Owner.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Owners retrieved successfully',
    data: { owners: owners.map(toSafeOwnerAdminView), pagination: paginationMeta(totalResults, page, limit) },
  });
});

const getOwnerById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  const owner = await Owner.findById(id);
  if (!owner) throw new ApiError(404, 'Owner not found');
  return sendSuccess(res, { statusCode: 200, message: 'Owner retrieved successfully', data: { owner: toSafeOwnerAdminView(owner) } });
});

const updateOwnerVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  ensureNoUnsupportedBodyFields(req.body, ['isVerified']);
  if (typeof req.body?.isVerified !== 'boolean') {
    throw new ApiError(400, 'Validation failed', [{ field: 'isVerified', message: 'isVerified must be true or false' }]);
  }
  const owner = await Owner.findById(id);
  if (!owner) throw new ApiError(404, 'Owner not found');
  const previous = { isVerified: Boolean(owner.isVerified) };
  owner.isVerified = req.body.isVerified;
  await owner.save();
  return sendSuccess(res, {
    statusCode: 200,
    message: `Owner ${owner.isVerified ? 'verified' : 'unverified'} successfully`,
    data: {
      owner: toSafeOwnerAdminView(owner),
      audit: { action: 'owner_verification_update', previous, current: { isVerified: Boolean(owner.isVerified) }, adminId: String(req.auth.id), at: new Date().toISOString() },
      note: 'Owner verification does not automatically approve accommodation listings.',
    },
  });
});

const updateOwnerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  ensureNoUnsupportedBodyFields(req.body, ['isActive']);
  if (typeof req.body?.isActive !== 'boolean') {
    throw new ApiError(400, 'Validation failed', [{ field: 'isActive', message: 'isActive must be true or false' }]);
  }
  const owner = await Owner.findById(id);
  if (!owner) throw new ApiError(404, 'Owner not found');
  const previous = { isActive: Boolean(owner.isActive) };
  owner.isActive = req.body.isActive;
  await owner.save();
  return sendSuccess(res, {
    statusCode: 200,
    message: `Owner account ${owner.isActive ? 'activated' : 'deactivated'} successfully`,
    data: { owner: toSafeOwnerAdminView(owner), audit: { action: 'owner_status_update', previous, current: { isActive: Boolean(owner.isActive) }, adminId: String(req.auth.id), at: new Date().toISOString() } },
  });
});

// Accommodations
const listAccommodations = asyncHandler(async (req, res) => {
  ensureSupportedQueryParams(req.query, ACCOMMODATION_LIST_QUERY_PARAMS);
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const city = parseSearch(req.query, 'city');
  const locality = parseSearch(req.query, 'locality');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  const { status, ownerId } = req.query;

  const filter = {};
  if (status !== undefined && status !== '') {
    if (!Object.values(ACCOMMODATION_STATUS).includes(status)) {
      throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${Object.values(ACCOMMODATION_STATUS).join(', ')}` }]);
    }
    filter.status = status;
  }
  if (ownerId !== undefined && ownerId !== '') {
    if (!isValidObjectId(ownerId)) throw new ApiError(400, 'Validation failed', [{ field: 'ownerId', message: 'ownerId must be a valid ObjectId' }]);
    filter.owner = ownerId;
  }
  if (isDemo !== undefined) filter.isDemo = isDemo;
  if (city) filter['location.city'] = { $regex: escapeRegex(city), $options: 'i' };
  if (locality) filter['location.locality'] = { $regex: escapeRegex(locality), $options: 'i' };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { description: rx }, { 'location.city': rx }, { 'location.locality': rx }];
  }

  const [accommodations, totalResults] = await Promise.all([
    Accommodation.find(filter).populate('owner', 'name email phone isVerified isActive isDemo role').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Accommodation.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Accommodations retrieved successfully',
    data: { accommodations: accommodations.map(toAdminAccommodationView), pagination: paginationMeta(totalResults, page, limit) },
  });
});

const getAccommodationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid accommodation ID');
  const accommodation = await Accommodation.findById(id).populate('owner', 'name email phone isVerified isActive isDemo role');
  if (!accommodation) throw new ApiError(404, 'Accommodation not found');
  return sendSuccess(res, { statusCode: 200, message: 'Accommodation retrieved successfully', data: { accommodation: toAdminAccommodationView(accommodation) } });
});

const decideAccommodation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid accommodation ID');
  ensureNoUnsupportedBodyFields(req.body, ['decision', 'rejectionReason']);
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'decision', message: "decision must be either 'approve' or 'reject'" }]);
  }

  const accommodation = await Accommodation.findById(id);
  if (!accommodation) throw new ApiError(404, 'Accommodation not found');

  const previous = {
    status: accommodation.status,
    rejectionReason: accommodation.rejectionReason || '',
  };
  const adminId = req.auth.id;
  const now = new Date();

  if (decision === 'approve') {
    const validationErrors = validateAccommodationForApproval(accommodation);
    if (validationErrors.length) {
      throw new ApiError(400, 'Accommodation cannot be approved due to invalid or missing required data', validationErrors);
    }
    accommodation.status = ACCOMMODATION_STATUS.APPROVED;
    accommodation.rejectionReason = '';
    accommodation.approvedAt = now;
    accommodation.approvedBy = adminId;
    // keep latest rejection audit fields for history but status reflects approval; do not invent extra behavior
  } else {
    const reasonRaw = req.body?.rejectionReason;
    const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
    if (!reason || reason.length < 5) {
      throw new ApiError(400, 'Validation failed', [{ field: 'rejectionReason', message: 'A meaningful rejection reason (at least 5 characters) is required when rejecting an accommodation' }]);
    }
    if (reason.length > 1000) {
      throw new ApiError(400, 'Validation failed', [{ field: 'rejectionReason', message: 'Rejection reason must be at most 1000 characters' }]);
    }
    accommodation.status = ACCOMMODATION_STATUS.REJECTED;
    accommodation.rejectionReason = reason;
    accommodation.rejectedAt = now;
    accommodation.rejectedBy = adminId;
  }

  await accommodation.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: decision === 'approve' ? 'Accommodation approved successfully' : 'Accommodation rejected successfully',
    data: {
      accommodation: toAdminAccommodationView(accommodation),
      audit: {
        action: decision === 'approve' ? 'accommodation_approved' : 'accommodation_rejected',
        adminId: String(adminId),
        previousStatus: previous.status,
        newStatus: accommodation.status,
        previousRejectionReason: previous.rejectionReason,
        newRejectionReason: accommodation.rejectionReason || '',
        at: now.toISOString(),
      },
      note: 'Owner resubmission workflow is preserved: when an owner edits/resubmits a rejected listing, it returns to pending for admin review (not auto-approved).',
    },
  });
});

// Reviews moderation
const listReviews = asyncHandler(async (req, res) => {
  ensureSupportedQueryParams(req.query, REVIEW_LIST_QUERY_PARAMS);
  const { page, limit, skip } = parsePagination(req.query);
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  const reported = parseBooleanQuery(req.query.reported, 'reported');
  const { status, accommodationId, studentId } = req.query;

  const filter = {};
  if (status !== undefined && status !== '') {
    if (!Object.values(MODERATION_STATUS).includes(status)) {
      throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${Object.values(MODERATION_STATUS).join(', ')}` }]);
    }
    filter.moderationStatus = status;
  }
  if (reported !== undefined) {
    filter.$or = reported
      ? [{ isReported: true }, { 'reports.0': { $exists: true } }]
      : [{ isReported: false }, { isReported: { $exists: false } }];
    // If reported=false and we need to ensure no reports, prefer $and with reports size 0 semantics not trivial;
    // simpler: reported=false => isReported false AND no reports entries
    if (!reported) {
      filter.$or = undefined;
      filter.isReported = { $ne: true };
      filter.$and = [{ $or: [{ reports: { $exists: false } }, { reports: { $size: 0 } }] }];
    }
  }
  if (accommodationId !== undefined && accommodationId !== '') {
    if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Validation failed', [{ field: 'accommodationId', message: 'accommodationId must be a valid ObjectId' }]);
    filter.accommodation = accommodationId;
  }
  if (studentId !== undefined && studentId !== '') {
    if (!isValidObjectId(studentId)) throw new ApiError(400, 'Validation failed', [{ field: 'studentId', message: 'studentId must be a valid ObjectId' }]);
    filter.student = studentId;
  }
  if (isDemo !== undefined) filter.isDemo = isDemo;

  const [reviews, totalResults] = await Promise.all([
    Review.find(filter)
      .populate('student', 'name email isActive isDemo role')
      .populate('accommodation', 'name status')
      .populate('reports.student', 'name email isActive isDemo role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Reviews retrieved successfully',
    data: { reviews: reviews.map(toAdminReviewView), pagination: paginationMeta(totalResults, page, limit) },
  });
});

const getReviewById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid review ID');
  const review = await Review.findById(id)
    .populate('student', 'name email isActive isDemo role')
    .populate('accommodation', 'name status')
    .populate('reports.student', 'name email isActive isDemo role');
  if (!review) throw new ApiError(404, 'Review not found');
  return sendSuccess(res, { statusCode: 200, message: 'Review retrieved successfully', data: { review: toAdminReviewView(review) } });
});

const moderateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid review ID');
  ensureNoUnsupportedBodyFields(req.body, ['action', 'moderationNote']);

  const action = req.body?.action;
  const allowedActions = ['approve', 'remove'];
  if (!allowedActions.includes(action)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'action', message: "action must be either 'approve' or 'remove'" }]);
  }

  const noteRaw = req.body?.moderationNote;
  const moderationNote = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (action === 'remove') {
    if (!moderationNote || moderationNote.length < 5) {
      throw new ApiError(400, 'Validation failed', [{ field: 'moderationNote', message: 'A meaningful moderation note/reason (at least 5 characters) is required when removing a review' }]);
    }
  }
  if (moderationNote && moderationNote.length > 500) {
    throw new ApiError(400, 'Validation failed', [{ field: 'moderationNote', message: 'moderationNote must be at most 500 characters' }]);
  }

  const review = await Review.findById(id)
    .populate('student', 'name email isActive isDemo role')
    .populate('accommodation', 'name status')
    .populate('reports.student', 'name email isActive isDemo role');
  if (!review) throw new ApiError(404, 'Review not found');

  const previousStatus = review.moderationStatus || MODERATION_STATUS.NONE;
  const newStatus = action === 'approve' ? MODERATION_STATUS.APPROVED : MODERATION_STATUS.REMOVED;
  const adminId = req.auth.id;
  const now = new Date();

  review.previousModerationStatus = previousStatus;
  review.moderationStatus = newStatus;
  review.moderationAction = action;
  review.moderationNote = moderationNote || review.moderationNote || '';
  review.moderatedBy = adminId;
  review.moderatedAt = now;

  // Moderation decision does not auto-delete reports; report handling is managed separately.

  await review.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: action === 'approve' ? 'Review approved successfully' : 'Review removed successfully',
    data: {
      review: toAdminReviewView(review),
      audit: {
        action: action === 'approve' ? 'review_approved' : 'review_removed',
        adminId: String(adminId),
        previousStatus,
        newStatus,
        reason: moderationNote || '',
        at: now.toISOString(),
      },
      policy: {
        publicEligible: newStatus === MODERATION_STATUS.NONE || newStatus === MODERATION_STATUS.APPROVED,
        ratingAggregationEligible: newStatus === MODERATION_STATUS.NONE || newStatus === MODERATION_STATUS.APPROVED,
        note: 'Removed reviews are excluded from public responses and rating aggregation per Step 7 policy.',
      },
    },
  });
});

const updateReportHandlingStatus = asyncHandler(async (req, res) => {
  const { reviewId, reportIndex } = req.params;
  if (!isValidObjectId(reviewId)) throw new ApiError(400, 'Invalid review ID');
  if (!/^\d+$/.test(String(reportIndex))) {
    throw new ApiError(400, 'Validation failed', [{ field: 'reportIndex', message: 'reportIndex must be a valid non-negative integer' }]);
  }
  const idx = Number(reportIndex);
  ensureNoUnsupportedBodyFields(req.body, ['status', 'handlingNote']);
  const status = req.body?.status;
  const allowed = ['pending', 'dismissed', 'actioned'];
  if (!allowed.includes(status)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${allowed.join(', ')}` }]);
  }
  const noteRaw = req.body?.handlingNote;
  const handlingNote = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (noteRaw !== undefined && typeof noteRaw !== 'string') {
    throw new ApiError(400, 'Validation failed', [{ field: 'handlingNote', message: 'handlingNote must be a string' }]);
  }
  if (handlingNote.length > 500) {
    throw new ApiError(400, 'Validation failed', [{ field: 'handlingNote', message: 'handlingNote must be at most 500 characters' }]);
  }

  const review = await Review.findById(reviewId)
    .populate('student', 'name email isActive isDemo role')
    .populate('accommodation', 'name status')
    .populate('reports.student', 'name email isActive isDemo role');
  if (!review) throw new ApiError(404, 'Review not found');

  const reports = Array.isArray(review.reports) ? review.reports : [];
  if (idx < 0 || idx >= reports.length) {
    throw new ApiError(404, 'Report not found');
  }

  const report = reports[idx];
  const previous = {
    status: report.status || 'pending',
    handledBy: report.handledBy ? String(report.handledBy) : null,
    handledAt: report.handledAt || null,
    handlingNote: report.handlingNote || '',
  };

  report.status = status;
  report.handlingNote = handlingNote;
  report.handledBy = req.auth.id;
  report.handledAt = new Date();

  // Dismissing/updating a report handling status must NOT automatically change review moderation status.
  review.reports = reports;
  await review.save();

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Report handling status updated successfully',
    data: {
      reviewId: String(review._id),
      report: toAdminReportView(review.reports[idx], idx),
      audit: {
        action: 'report_handling_update',
        adminId: String(req.auth.id),
        previousStatus: previous.status,
        newStatus: status,
        at: report.handledAt.toISOString(),
      },
      note: 'Updating report handling status does not automatically change the review moderation status.',
      reviewModerationStatus: review.moderationStatus,
    },
  });
});

module.exports = {
  getDashboardStats,
  listStudents,
  getStudentById,
  updateStudentStatus,
  listOwners,
  getOwnerById,
  updateOwnerVerification,
  updateOwnerStatus,
  listAccommodations,
  getAccommodationById,
  decideAccommodation,
  listReviews,
  getReviewById,
  moderateReview,
  updateReportHandlingStatus,
  // exported for testing/reuse if needed
  toSafeStudentAdminView,
  toSafeOwnerAdminView,
  toAdminAccommodationView,
  toAdminReviewView,
};
