const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const { getCollections, withWriteLock } = require('../store');
const { sameId, isValidId } = require('../ids');
const { nowIso } = require('../utils/storeHelpers');
const {
  ACCOMMODATION_STATUS,
  MODERATION_STATUS,
  ROLES,
} = require('../../utils/constants');
const { isValidObjectId, trimString } = require('../../utils/validators');
const { sanitizePhotoArrayForResponse } = require('../../utils/uploadValidation');

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
  throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be true or false` }]);
}

function parseSearch(query, fieldName) {
  const v = query[fieldName];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be a string` }]);
  const t = v.trim();
  if (!t) return undefined;
  if (t.length > 100) throw new ApiError(400, 'Validation failed', [{ field: fieldName, message: `${fieldName} must be at most 100 characters` }]);
  return t;
}

function matches(value, needle) { return String(value || '').toLowerCase().includes(String(needle || '').toLowerCase()); }
function paginationMeta(totalResults, page, limit) {
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);
  return { totalResults, currentPage: page, totalPages, limit, hasNextPage: totalPages > 0 && page < totalPages, hasPrevPage: page > 1 && totalResults > 0 };
}

function safeStudent(s) {
  return { id: String(s._id), name: s.name, email: s.email, phone: s.phone || '', role: ROLES.STUDENT, isActive: Boolean(s.isActive), isDemo: Boolean(s.isDemo), favouritesCount: Array.isArray(s.favourites) ? s.favourites.length : 0, createdAt: s.createdAt, updatedAt: s.updatedAt };
}
function safeOwner(o) {
  return { id: String(o._id), name: o.name, email: o.email, phone: o.phone || '', role: ROLES.OWNER, isActive: Boolean(o.isActive), isVerified: Boolean(o.isVerified), isDemo: Boolean(o.isDemo), createdAt: o.createdAt, updatedAt: o.updatedAt };
}
function adminAccommodation(a, owner) {
  return {
    id: String(a._id),
    owner: owner ? safeOwner(owner) : (a.owner ? String(a.owner) : null),
    name: a.name,
    description: a.description,
    accommodationType: a.accommodationType,
    genderType: a.genderType,
    suitableFor: a.suitableFor || '',
    location: a.location || {},
    pricing: a.pricing || {},
    roomDetails: a.roomDetails || {},
    foodInfo: a.foodInfo || {},
    facilities: Array.isArray(a.facilities) ? a.facilities : [],
    rules: a.rules || {},
    availability: a.availability || {},
    contact: a.contact || {},
    photos: sanitizePhotoArrayForResponse(a.photos, a._id),
    status: a.status,
    rejectionReason: a.rejectionReason || '',
    isDemo: Boolean(a.isDemo),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
function adminReportView(r, index) {
  const student = r.student && typeof r.student === 'object' ? r.student : null;
  return {
    index,
    student: student ? { id: String(student._id || student.id), name: student.name, email: student.email } : (r.student ? { id: String(r.student) } : null),
    reason: r.reason || '',
    status: r.status || 'pending',
    handlingNote: r.handlingNote || '',
    handledBy: r.handledBy ? String(r.handledBy) : null,
    handledAt: r.handledAt || null,
    createdAt: r.createdAt || null,
  };
}
function adminReviewView(r, student, accommodation) {
  const reports = Array.isArray(r.reports) ? r.reports : [];
  return {
    id: String(r._id),
    accommodation: accommodation ? { id: String(accommodation._id), name: accommodation.name, status: accommodation.status } : { id: String(r.accommodation) },
    student: student ? { id: String(student._id), name: student.name, email: student.email, isActive: Boolean(student.isActive) } : { id: String(r.student) },
    rating: r.rating,
    comment: r.comment,
    reviewerDisplayName: r.reviewerDisplayName || '',
    moderationStatus: r.moderationStatus || MODERATION_STATUS.NONE,
    previousModerationStatus: r.previousModerationStatus || '',
    moderationAction: r.moderationAction || '',
    moderationNote: r.moderationNote || '',
    moderatedBy: r.moderatedBy ? String(r.moderatedBy) : null,
    moderatedAt: r.moderatedAt || null,
    isReported: Boolean(r.isReported) || reports.length > 0,
    reportReason: r.reportReason || '',
    reportCount: reports.length,
    reports: reports.map((rep, idx) => adminReportView(rep, idx)),
    isDemo: Boolean(r.isDemo),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

const getDashboardStats = asyncHandler(async (req, res) => {
  const { students, owners, accommodations, reviews } = getCollections();
  const stats = {
    students: {
      total: students.length,
      active: students.filter((s) => s.isActive !== false).length,
      inactive: students.filter((s) => s.isActive === false).length,
    },
    owners: {
      total: owners.length,
      active: owners.filter((o) => o.isActive !== false).length,
      inactive: owners.filter((o) => o.isActive === false).length,
      verified: owners.filter((o) => o.isVerified === true).length,
      unverified: owners.filter((o) => o.isVerified !== true).length,
    },
    accommodations: {
      total: accommodations.length,
      pending: accommodations.filter((a) => a.status === ACCOMMODATION_STATUS.PENDING).length,
      approved: accommodations.filter((a) => a.status === ACCOMMODATION_STATUS.APPROVED).length,
      rejected: accommodations.filter((a) => a.status === ACCOMMODATION_STATUS.REJECTED).length,
      available: accommodations.filter((a) => a.availability?.status === 'Available').length,
      full: accommodations.filter((a) => a.availability?.status === 'Full').length,
    },
    reviews: {
      total: reviews.length,
      reported: reviews.filter((r) => r.isReported || (Array.isArray(r.reports) && r.reports.length > 0)).length,
      pendingReports: reviews.reduce((acc, r) => acc + (Array.isArray(r.reports) ? r.reports.filter((x) => (x.status || 'pending') === 'pending').length : 0), 0),
      removed: reviews.filter((r) => r.moderationStatus === MODERATION_STATUS.REMOVED).length,
    },
  };
  return sendSuccess(res, { statusCode: 200, message: 'Dashboard statistics retrieved successfully', data: { stats } });
});

const listStudents = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const isActive = parseBooleanQuery(req.query.isActive, 'isActive');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  let items = getCollections().students.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  if (isActive !== undefined) items = items.filter((s) => Boolean(s.isActive) === isActive);
  if (isDemo !== undefined) items = items.filter((s) => Boolean(s.isDemo) === isDemo);
  if (search) items = items.filter((s) => matches(s.name, search) || matches(s.email, search));
  const totalResults = items.length;
  const pageItems = items.slice(skip, skip + limit);
  return sendSuccess(res, { statusCode: 200, message: 'Students retrieved successfully', data: { students: pageItems.map(safeStudent), pagination: paginationMeta(totalResults, page, limit) } });
});

const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid student ID');
  const student = getCollections().students.find((s) => sameId(s._id, id));
  if (!student) throw new ApiError(404, 'Student not found');
  return sendSuccess(res, { statusCode: 200, message: 'Student retrieved successfully', data: { student: safeStudent(student) } });
});

const updateStudentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid student ID');
  if (typeof req.body?.isActive !== 'boolean') throw new ApiError(400, 'Validation failed', [{ field: 'isActive', message: 'isActive must be true or false' }]);
  let previous, updated;
  await withWriteLock(async (state) => {
    const student = state.students.find((s) => sameId(s._id, id));
    if (!student) throw new ApiError(404, 'Student not found');
    previous = { isActive: Boolean(student.isActive) };
    student.isActive = req.body.isActive;
    student.updatedAt = nowIso();
    updated = { ...student };
  });
  return sendSuccess(res, { statusCode: 200, message: `Student account ${updated.isActive ? 'activated' : 'deactivated'} successfully`, data: { student: safeStudent(updated), audit: { action: 'student_status_update', previous, current: { isActive: Boolean(updated.isActive) }, adminId: String(req.auth.id), at: nowIso() } } });
});

const listOwners = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const isActive = parseBooleanQuery(req.query.isActive, 'isActive');
  const isVerified = parseBooleanQuery(req.query.isVerified, 'isVerified');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  let items = getCollections().owners.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  if (isActive !== undefined) items = items.filter((o) => Boolean(o.isActive) === isActive);
  if (isVerified !== undefined) items = items.filter((o) => Boolean(o.isVerified) === isVerified);
  if (isDemo !== undefined) items = items.filter((o) => Boolean(o.isDemo) === isDemo);
  if (search) items = items.filter((o) => matches(o.name, search) || matches(o.email, search));
  const totalResults = items.length;
  const pageItems = items.slice(skip, skip + limit);
  return sendSuccess(res, { statusCode: 200, message: 'Owners retrieved successfully', data: { owners: pageItems.map(safeOwner), pagination: paginationMeta(totalResults, page, limit) } });
});

const getOwnerById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  const owner = getCollections().owners.find((o) => sameId(o._id, id));
  if (!owner) throw new ApiError(404, 'Owner not found');
  return sendSuccess(res, { statusCode: 200, message: 'Owner retrieved successfully', data: { owner: safeOwner(owner) } });
});

const updateOwnerVerification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  if (typeof req.body?.isVerified !== 'boolean') throw new ApiError(400, 'Validation failed', [{ field: 'isVerified', message: 'isVerified must be true or false' }]);
  let previous, updated;
  await withWriteLock(async (state) => {
    const owner = state.owners.find((o) => sameId(o._id, id));
    if (!owner) throw new ApiError(404, 'Owner not found');
    previous = { isVerified: Boolean(owner.isVerified) };
    owner.isVerified = req.body.isVerified;
    owner.updatedAt = nowIso();
    updated = { ...owner };
  });
  return sendSuccess(res, { statusCode: 200, message: `Owner ${updated.isVerified ? 'verified' : 'unverified'} successfully`, data: { owner: safeOwner(updated), audit: { action: 'owner_verification_update', previous, current: { isVerified: Boolean(updated.isVerified) }, adminId: String(req.auth.id), at: nowIso() }, note: 'Owner verification does not automatically approve accommodation listings.' } });
});

const updateOwnerStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid owner ID');
  if (typeof req.body?.isActive !== 'boolean') throw new ApiError(400, 'Validation failed', [{ field: 'isActive', message: 'isActive must be true or false' }]);
  let previous, updated;
  await withWriteLock(async (state) => {
    const owner = state.owners.find((o) => sameId(o._id, id));
    if (!owner) throw new ApiError(404, 'Owner not found');
    previous = { isActive: Boolean(owner.isActive) };
    owner.isActive = req.body.isActive;
    owner.updatedAt = nowIso();
    updated = { ...owner };
  });
  return sendSuccess(res, { statusCode: 200, message: `Owner account ${updated.isActive ? 'activated' : 'deactivated'} successfully`, data: { owner: safeOwner(updated), audit: { action: 'owner_status_update', previous, current: { isActive: Boolean(updated.isActive) }, adminId: String(req.auth.id), at: nowIso() } } });
});

const listAccommodations = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = parseSearch(req.query, 'search');
  const city = parseSearch(req.query, 'city');
  const locality = parseSearch(req.query, 'locality');
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  const { status, ownerId } = req.query;
  if (status !== undefined && status !== '' && !Object.values(ACCOMMODATION_STATUS).includes(status)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${Object.values(ACCOMMODATION_STATUS).join(', ')}` }]);
  }
  if (ownerId !== undefined && ownerId !== '' && !isValidObjectId(ownerId)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'ownerId', message: 'ownerId must be a valid ObjectId' }]);
  }
  let items = getCollections().accommodations.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  if (status) items = items.filter((a) => a.status === status);
  if (ownerId) items = items.filter((a) => sameId(a.owner, ownerId));
  if (isDemo !== undefined) items = items.filter((a) => Boolean(a.isDemo) === isDemo);
  if (city) items = items.filter((a) => matches(a.location?.city, city));
  if (locality) items = items.filter((a) => matches(a.location?.locality, locality));
  if (search) items = items.filter((a) => matches(a.name, search) || matches(a.description, search) || matches(a.location?.city, search) || matches(a.location?.locality, search));
  const totalResults = items.length;
  const pageItems = items.slice(skip, skip + limit);
  const owners = getCollections().owners;
  const result = pageItems.map((a) => adminAccommodation(a, owners.find((o) => sameId(o._id, a.owner))));
  return sendSuccess(res, { statusCode: 200, message: 'Accommodations retrieved successfully', data: { accommodations: result, pagination: paginationMeta(totalResults, page, limit) } });
});

const getAccommodationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid accommodation ID');
  const { accommodations, owners } = getCollections();
  const accommodation = accommodations.find((a) => sameId(a._id, id));
  if (!accommodation) throw new ApiError(404, 'Accommodation not found');
  const owner = owners.find((o) => sameId(o._id, accommodation.owner));
  return sendSuccess(res, { statusCode: 200, message: 'Accommodation retrieved successfully', data: { accommodation: adminAccommodation(accommodation, owner) } });
});

function validateAccommodationForApproval(accommodation) {
  const errors = [];
  if (!accommodation.name) errors.push({ field: 'name', message: 'Accommodation name is required' });
  if (!accommodation.description) errors.push({ field: 'description', message: 'Description is required' });
  if (!accommodation.location?.city) errors.push({ field: 'location.city', message: 'City is required' });
  if (!accommodation.location?.locality) errors.push({ field: 'location.locality', message: 'Locality is required' });
  if (!(Number(accommodation.pricing?.monthlyRent) >= 0)) errors.push({ field: 'pricing.monthlyRent', message: 'Monthly rent is required' });
  if (!accommodation.contact?.contactNumber) errors.push({ field: 'contact.contactNumber', message: 'Contact number is required' });
  return errors;
}

const decideAccommodation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid accommodation ID');
  const decision = req.body?.decision;
  if (!['approve', 'reject'].includes(decision)) throw new ApiError(400, 'Validation failed', [{ field: 'decision', message: "decision must be either 'approve' or 'reject'" }]);

  let updated, audit;
  await withWriteLock(async (state) => {
    const accommodation = state.accommodations.find((a) => sameId(a._id, id));
    if (!accommodation) throw new ApiError(404, 'Accommodation not found');
    const previous = { status: accommodation.status, rejectionReason: accommodation.rejectionReason || '' };
    const ts = nowIso();

    if (decision === 'approve') {
      const validationErrors = validateAccommodationForApproval(accommodation);
      if (validationErrors.length) throw new ApiError(400, 'Accommodation cannot be approved due to invalid or missing required data', validationErrors);
      accommodation.status = ACCOMMODATION_STATUS.APPROVED;
      accommodation.rejectionReason = '';
      accommodation.approvedAt = ts;
      accommodation.approvedBy = String(req.auth.id);
    } else {
      const reasonRaw = req.body?.rejectionReason;
      const reason = typeof reasonRaw === 'string' ? reasonRaw.trim() : '';
      if (!reason || reason.length < 5) throw new ApiError(400, 'Validation failed', [{ field: 'rejectionReason', message: 'A meaningful rejection reason (at least 5 characters) is required when rejecting an accommodation' }]);
      if (reason.length > 1000) throw new ApiError(400, 'Validation failed', [{ field: 'rejectionReason', message: 'Rejection reason must be at most 1000 characters' }]);
      accommodation.status = ACCOMMODATION_STATUS.REJECTED;
      accommodation.rejectionReason = reason;
      accommodation.rejectedAt = ts;
      accommodation.rejectedBy = String(req.auth.id);
    }
    accommodation.updatedAt = ts;
    updated = { ...accommodation };
    audit = { action: decision === 'approve' ? 'accommodation_approved' : 'accommodation_rejected', adminId: String(req.auth.id), previousStatus: previous.status, newStatus: accommodation.status, previousRejectionReason: previous.rejectionReason, newRejectionReason: accommodation.rejectionReason || '', at: ts };
  });

  const owner = getCollections().owners.find((o) => sameId(o._id, updated.owner));
  return sendSuccess(res, { statusCode: 200, message: decision === 'approve' ? 'Accommodation approved successfully' : 'Accommodation rejected successfully', data: { accommodation: adminAccommodation(updated, owner), audit, note: 'Owner resubmission workflow is preserved: when an owner edits/resubmits a rejected listing, it returns to pending for admin review (not auto-approved).' } });
});

const listReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const isDemo = parseBooleanQuery(req.query.isDemo, 'isDemo');
  const reported = parseBooleanQuery(req.query.reported, 'reported');
  const { status, accommodationId, studentId } = req.query;
  if (status !== undefined && status !== '' && !Object.values(MODERATION_STATUS).includes(status)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${Object.values(MODERATION_STATUS).join(', ')}` }]);
  }
  if (accommodationId && !isValidObjectId(accommodationId)) throw new ApiError(400, 'Validation failed', [{ field: 'accommodationId', message: 'accommodationId must be a valid ObjectId' }]);
  if (studentId && !isValidObjectId(studentId)) throw new ApiError(400, 'Validation failed', [{ field: 'studentId', message: 'studentId must be a valid ObjectId' }]);

  let items = getCollections().reviews.slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));
  if (status) items = items.filter((r) => (r.moderationStatus || MODERATION_STATUS.NONE) === status);
  if (reported !== undefined) {
    items = items.filter((r) => {
      const hasReports = Array.isArray(r.reports) && r.reports.length > 0;
      const isRep = Boolean(r.isReported) || hasReports;
      return reported ? isRep : !isRep;
    });
  }
  if (accommodationId) items = items.filter((r) => sameId(r.accommodation, accommodationId));
  if (studentId) items = items.filter((r) => sameId(r.student, studentId));
  if (isDemo !== undefined) items = items.filter((r) => Boolean(r.isDemo) === isDemo);
  const totalResults = items.length;
  const pageItems = items.slice(skip, skip + limit);
  const { students, accommodations } = getCollections();
  const result = pageItems.map((r) => adminReviewView(r, students.find((s) => sameId(s._id, r.student)), accommodations.find((a) => sameId(a._id, r.accommodation))));
  return sendSuccess(res, { statusCode: 200, message: 'Reviews retrieved successfully', data: { reviews: result, pagination: paginationMeta(totalResults, page, limit) } });
});

const getReviewById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid review ID');
  const { reviews, students, accommodations } = getCollections();
  const review = reviews.find((r) => sameId(r._id, id));
  if (!review) throw new ApiError(404, 'Review not found');
  return sendSuccess(res, { statusCode: 200, message: 'Review retrieved successfully', data: { review: adminReviewView(review, students.find((s) => sameId(s._id, review.student)), accommodations.find((a) => sameId(a._id, review.accommodation))) } });
});

const moderateReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) throw new ApiError(400, 'Invalid review ID');
  const action = req.body?.action;
  if (!['approve', 'remove'].includes(action)) throw new ApiError(400, 'Validation failed', [{ field: 'action', message: "action must be either 'approve' or 'remove'" }]);
  const noteRaw = req.body?.moderationNote;
  const moderationNote = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (action === 'remove' && (!moderationNote || moderationNote.length < 5)) {
    throw new ApiError(400, 'Validation failed', [{ field: 'moderationNote', message: 'A meaningful moderation note/reason (at least 5 characters) is required when removing a review' }]);
  }
  if (moderationNote.length > 500) throw new ApiError(400, 'Validation failed', [{ field: 'moderationNote', message: 'moderationNote must be at most 500 characters' }]);

  let updated, previousStatus, newStatus, ts;
  await withWriteLock(async (state) => {
    const review = state.reviews.find((r) => sameId(r._id, id));
    if (!review) throw new ApiError(404, 'Review not found');
    previousStatus = review.moderationStatus || MODERATION_STATUS.NONE;
    newStatus = action === 'approve' ? MODERATION_STATUS.APPROVED : MODERATION_STATUS.REMOVED;
    ts = nowIso();
    review.previousModerationStatus = previousStatus;
    review.moderationStatus = newStatus;
    review.moderationAction = action;
    review.moderationNote = moderationNote || review.moderationNote || '';
    review.moderatedBy = String(req.auth.id);
    review.moderatedAt = ts;
    review.updatedAt = ts;
    updated = { ...review };
  });

  const { students, accommodations } = getCollections();
  return sendSuccess(res, {
    statusCode: 200,
    message: action === 'approve' ? 'Review approved successfully' : 'Review removed successfully',
    data: {
      review: adminReviewView(updated, students.find((s) => sameId(s._id, updated.student)), accommodations.find((a) => sameId(a._id, updated.accommodation))),
      audit: { action: action === 'approve' ? 'review_approved' : 'review_removed', adminId: String(req.auth.id), previousStatus, newStatus, reason: moderationNote || '', at: ts },
      policy: { publicEligible: newStatus === MODERATION_STATUS.NONE || newStatus === MODERATION_STATUS.APPROVED, ratingAggregationEligible: newStatus === MODERATION_STATUS.NONE || newStatus === MODERATION_STATUS.APPROVED, note: 'Removed reviews are excluded from public responses and rating aggregation per Step 7 policy.' },
    },
  });
});

const updateReportHandlingStatus = asyncHandler(async (req, res) => {
  const { reviewId, reportIndex } = req.params;
  if (!isValidObjectId(reviewId)) throw new ApiError(400, 'Invalid review ID');
  if (!/^\d+$/.test(String(reportIndex))) throw new ApiError(400, 'Validation failed', [{ field: 'reportIndex', message: 'reportIndex must be a valid non-negative integer' }]);
  const idx = Number(reportIndex);
  const status = req.body?.status;
  const allowed = ['pending', 'dismissed', 'actioned'];
  if (!allowed.includes(status)) throw new ApiError(400, 'Validation failed', [{ field: 'status', message: `status must be one of: ${allowed.join(', ')}` }]);
  const noteRaw = req.body?.handlingNote;
  const handlingNote = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (noteRaw !== undefined && typeof noteRaw !== 'string') throw new ApiError(400, 'Validation failed', [{ field: 'handlingNote', message: 'handlingNote must be a string' }]);
  if (handlingNote.length > 500) throw new ApiError(400, 'Validation failed', [{ field: 'handlingNote', message: 'handlingNote must be at most 500 characters' }]);

  let previous, report, reviewModerationStatus, ts;
  await withWriteLock(async (state) => {
    const review = state.reviews.find((r) => sameId(r._id, reviewId));
    if (!review) throw new ApiError(404, 'Review not found');
    const reports = Array.isArray(review.reports) ? review.reports : [];
    if (idx < 0 || idx >= reports.length) throw new ApiError(404, 'Report not found');
    const rep = reports[idx];
    previous = { status: rep.status || 'pending', handledBy: rep.handledBy ? String(rep.handledBy) : null, handledAt: rep.handledAt || null, handlingNote: rep.handlingNote || '' };
    ts = nowIso();
    rep.status = status;
    rep.handlingNote = handlingNote;
    rep.handledBy = String(req.auth.id);
    rep.handledAt = ts;
    review.reports = reports;
    review.updatedAt = ts;
    report = { ...rep };
    reviewModerationStatus = review.moderationStatus || MODERATION_STATUS.NONE;
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Report handling status updated successfully',
    data: {
      reviewId: String(reviewId),
      report: adminReportView(report, idx),
      audit: { action: 'report_handling_update', adminId: String(req.auth.id), previousStatus: previous.status, newStatus: status, at: ts },
      note: 'Updating report handling status does not automatically change the review moderation status.',
      reviewModerationStatus,
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
};
