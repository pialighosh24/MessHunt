const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { sendSuccess } = require('../../utils/ApiResponse');
const { ACCOMMODATION_STATUS, MODERATION_STATUS } = require('../../utils/constants');
const { isValidObjectId, isValidRating, trimString } = require('../../utils/validators');
const { withWriteLock, getCollections } = require('../store');
const { newId, sameId } = require('../ids');
const { PUBLIC_REVIEW_MODERATION_STATUSES } = require('../utils/reviewAggregation');
const { nowIso } = require('../utils/storeHelpers');

const PROTECTED_REVIEW_FIELDS = new Set([
  '_id','id','accommodation','student','reviewerDisplayName','isReported','reportReason','reports','moderationStatus','moderatedAt','moderationNote','moderatedBy','moderationAction','previousModerationStatus','isDemo','createdAt','updatedAt','__v',
]);

function parsePagination(query = {}) {
  const pageRaw = query.page === undefined || query.page === '' ? '1' : String(query.page);
  const limitRaw = query.limit === undefined || query.limit === '' ? '10' : String(query.limit);
  if (!/^\d+$/.test(pageRaw)) throw new ApiError(400, 'Validation failed', [{ field: 'page', message: 'page must be a valid integer' }]);
  if (!/^\d+$/.test(limitRaw)) throw new ApiError(400, 'Validation failed', [{ field: 'limit', message: 'limit must be a valid integer' }]);
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  if (page < 1 || page > 10000) throw new ApiError(400, 'Validation failed', [{ field: 'page', message: 'page must be between 1 and 10000' }]);
  if (limit < 1 || limit > 50) throw new ApiError(400, 'Validation failed', [{ field: 'limit', message: 'limit must be between 1 and 50' }]);
  return { page, limit, skip: (page - 1) * limit };
}

function validateComment(comment, { required = true } = {}) {
  if (comment === undefined || comment === null || comment === '') {
    if (required) throw new ApiError(400, 'Validation failed', [{ field: 'comment', message: 'Comment is required' }]);
    return undefined;
  }
  if (typeof comment !== 'string') throw new ApiError(400, 'Validation failed', [{ field: 'comment', message: 'Comment must be a string' }]);
  const trimmed = comment.trim();
  if (required && !trimmed) throw new ApiError(400, 'Validation failed', [{ field: 'comment', message: 'Comment is required' }]);
  if (trimmed.length < 3 || trimmed.length > 1000) throw new ApiError(400, 'Validation failed', [{ field: 'comment', message: 'Comment must be between 3 and 1000 characters' }]);
  return trimmed;
}

function validateRating(rating, { required = true } = {}) {
  if (rating === undefined || rating === null || rating === '') {
    if (required) throw new ApiError(400, 'Validation failed', [{ field: 'rating', message: 'Rating is required' }]);
    return undefined;
  }
  const num = Number(rating);
  if (!isValidRating(num)) throw new ApiError(400, 'Validation failed', [{ field: 'rating', message: 'Rating must be an integer between 1 and 5' }]);
  return num;
}

function ensureNoProtectedReviewFields(body = {}, allowed = []) {
  const allowedSet = new Set(allowed);
  const errors = [];
  for (const key of Object.keys(body || {})) {
    if (allowedSet.has(key)) continue;
    if (PROTECTED_REVIEW_FIELDS.has(key)) errors.push({ field: key, message: `${key} cannot be set by client` });
    else errors.push({ field: key, message: `${key} is not allowed` });
  }
  if (errors.length) throw new ApiError(400, 'Validation failed', errors);
}

function toPublicReviewResponse(review) {
  return {
    id: String(review._id),
    rating: review.rating,
    comment: review.comment,
    reviewerDisplayName: review.reviewerDisplayName,
    date: review.updatedAt || review.createdAt,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

function findApprovedAccommodationOr404(accommodationId) {
  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');
  const { accommodations } = getCollections();
  const accommodation = accommodations.find((a) => sameId(a._id, accommodationId));
  if (!accommodation || accommodation.status !== ACCOMMODATION_STATUS.APPROVED) {
    throw new ApiError(404, 'Accommodation not found');
  }
  return accommodation;
}

const createReview = asyncHandler(async (req, res) => {
  const { id: accommodationId } = req.params;
  const studentId = req.auth.id;

  if (!isValidObjectId(accommodationId)) throw new ApiError(400, 'Invalid accommodation ID');
  ensureNoProtectedReviewFields(req.body, ['rating', 'comment']);
  const rating = validateRating(req.body.rating, { required: true });
  const comment = validateComment(req.body.comment, { required: true });

  const ts = nowIso();
  let createdReview;

  await withWriteLock(async (state) => {
    const accommodation = state.accommodations.find((a) => sameId(a._id, accommodationId));
    const student = state.students.find((s) => sameId(s._id, studentId));

    if (!accommodation || accommodation.status !== ACCOMMODATION_STATUS.APPROVED) {
      throw new ApiError(403, 'Reviews can only be submitted for approved accommodations');
    }
    if (!student) throw new ApiError(404, 'Student account not found');

    const existing = state.reviews.find((r) => sameId(r.accommodation, accommodationId) && sameId(r.student, studentId));
    if (existing) {
      throw new ApiError(409, 'You have already reviewed this accommodation. You can edit your existing review instead.');
    }

    createdReview = {
      _id: newId(),
      accommodation: String(accommodation._id),
      student: String(student._id),
      rating,
      comment,
      reviewerDisplayName: trimString(student.name) || 'Student',
      moderationStatus: MODERATION_STATUS.NONE,
      isReported: false,
      reportReason: '',
      reports: [],
      moderationAction: '',
      moderationNote: '',
      moderatedBy: null,
      moderatedAt: null,
      previousModerationStatus: '',
      isDemo: Boolean(student.isDemo || accommodation.isDemo),
      createdAt: ts,
      updatedAt: ts,
    };
    state.reviews.push(createdReview);
  });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Review submitted successfully',
    data: {
      review: toPublicReviewResponse(createdReview),
      eligibilityNote: 'This review is subject to moderation policy; it is not marked as a verified-stay review.',
    },
  });
});

const getAccommodationReviews = asyncHandler(async (req, res) => {
  const { id: accommodationId } = req.params;
  const accommodation = findApprovedAccommodationOr404(accommodationId);
  const { page, limit, skip } = parsePagination(req.query);

  const { reviews } = getCollections();
  const eligible = reviews
    .filter((r) => sameId(r.accommodation, accommodation._id) && PUBLIC_REVIEW_MODERATION_STATUSES.includes(r.moderationStatus || MODERATION_STATUS.NONE))
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const totalResults = eligible.length;
  const totalPages = totalResults === 0 ? 0 : Math.ceil(totalResults / limit);
  const pageItems = eligible.slice(skip, skip + limit);

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Reviews retrieved successfully',
    data: {
      reviews: pageItems.map(toPublicReviewResponse),
      pagination: {
        totalResults,
        currentPage: page,
        totalPages,
        limit,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPrevPage: page > 1 && totalResults > 0,
      },
      moderationPolicy: {
        publicEligibleStatuses: PUBLIC_REVIEW_MODERATION_STATUSES,
        note: 'Only eligible reviews are shown. Reported reviews are not automatically treated as misconduct; moderation decisions determine public visibility where applicable.',
      },
    },
  });
});

const updateReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const studentId = req.auth.id;

  if (!isValidObjectId(reviewId)) throw new ApiError(400, 'Invalid review ID');
  ensureNoProtectedReviewFields(req.body, ['rating', 'comment']);

  const hasRating = Object.prototype.hasOwnProperty.call(req.body || {}, 'rating');
  const hasComment = Object.prototype.hasOwnProperty.call(req.body || {}, 'comment');
  if (!hasRating && !hasComment) {
    throw new ApiError(400, 'Validation failed', [{ field: 'body', message: 'At least one of rating or comment is required' }]);
  }

  let updated;
  await withWriteLock(async (state) => {
    const review = state.reviews.find((r) => sameId(r._id, reviewId));
    if (!review || !sameId(review.student, studentId)) {
      throw new ApiError(404, 'Review not found');
    }
    if (hasRating) review.rating = validateRating(req.body.rating, { required: true });
    if (hasComment) review.comment = validateComment(req.body.comment, { required: true });
    review.updatedAt = nowIso();
    updated = { ...review };
  });

  return sendSuccess(res, { statusCode: 200, message: 'Review updated successfully', data: { review: toPublicReviewResponse(updated) } });
});

const deleteReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const studentId = req.auth.id;

  if (!isValidObjectId(reviewId)) throw new ApiError(400, 'Invalid review ID');

  await withWriteLock(async (state) => {
    const idx = state.reviews.findIndex((r) => sameId(r._id, reviewId));
    if (idx === -1 || !sameId(state.reviews[idx].student, studentId)) {
      throw new ApiError(404, 'Review not found');
    }
    state.reviews.splice(idx, 1);
  });

  return sendSuccess(res, { statusCode: 200, message: 'Review deleted successfully', data: { id: String(reviewId) } });
});

const reportReview = asyncHandler(async (req, res) => {
  const { reviewId } = req.params;
  const studentId = req.auth.id;

  if (!isValidObjectId(reviewId)) throw new ApiError(400, 'Invalid review ID');

  const body = req.body || {};
  const allowedReportFields = ['reason'];
  const extraErrors = [];
  for (const key of Object.keys(body)) {
    if (!allowedReportFields.includes(key)) extraErrors.push({ field: key, message: `${key} is not allowed` });
  }
  if (extraErrors.length) throw new ApiError(400, 'Validation failed', extraErrors);

  const reasonRaw = body.reason;
  if (typeof reasonRaw !== 'string' || !reasonRaw.trim()) {
    throw new ApiError(400, 'Validation failed', [{ field: 'reason', message: 'Report reason is required' }]);
  }
  const reason = reasonRaw.trim();
  if (reason.length < 5 || reason.length > 500) {
    throw new ApiError(400, 'Validation failed', [{ field: 'reason', message: 'Report reason must be between 5 and 500 characters' }]);
  }

  let reportCount = 0;
  await withWriteLock(async (state) => {
    const review = state.reviews.find((r) => sameId(r._id, reviewId));
    if (!review) throw new ApiError(404, 'Review not found');
    if (sameId(review.student, studentId)) throw new ApiError(400, 'You cannot report your own review');

    const reports = Array.isArray(review.reports) ? review.reports : [];
    const alreadyReported = reports.some((r) => sameId(r.student, studentId));
    if (alreadyReported) throw new ApiError(409, 'You have already reported this review');

    reports.push({ student: String(studentId), reason, createdAt: nowIso(), status: 'pending', handlingNote: '', handledBy: null, handledAt: null });
    review.reports = reports;
    review.isReported = true;
    review.reportReason = reason;
    review.updatedAt = nowIso();
    reportCount = reports.length;
  });

  return sendSuccess(res, {
    statusCode: 200,
    message: 'Review reported successfully. It will be reviewed according to moderation policy.',
    data: { reviewId: String(reviewId), reported: true, reportCount },
  });
});

module.exports = { createReview, getAccommodationReviews, updateReview, deleteReview, reportReview, toPublicReviewResponse };
