const mongoose = require('mongoose');
const { Review } = require('../models');
const { MODERATION_STATUS } = require('./constants');

/**
 * Moderation eligibility policy (Step 7):
 * - Eligible for public display and rating aggregation: moderationStatus in ['none', 'approved']
 * - Not eligible: moderationStatus in ['pending', 'removed']
 * - Deleted reviews are not counted because they are removed from the collection.
 * - A student report alone does NOT automatically mark a review as misconduct; reporting stores report data
 *   and flags isReported, but moderationStatus remains unchanged unless an admin/moderation action later sets it.
 */
const PUBLIC_REVIEW_MODERATION_STATUSES = Object.freeze([
  MODERATION_STATUS.NONE,
  MODERATION_STATUS.APPROVED,
]);

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

function buildEmptyRatingSummary() {
  return {
    available: false,
    averageRating: null,
    reviewCount: 0,
  };
}

async function getReviewAggregatesByAccommodationIds(accommodationIds = []) {
  const ids = Array.from(
    new Set(
      (accommodationIds || [])
        .filter(Boolean)
        .map((id) => String(id))
    )
  );

  if (ids.length === 0) return new Map();

  const objectIds = ids.map(toObjectId);
  const rows = await Review.aggregate([
    {
      $match: {
        accommodation: { $in: objectIds },
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
  ]);

  const map = new Map();
  for (const row of rows) {
    const reviewCount = Number(row.reviewCount || 0);
    const avg = reviewCount > 0 ? Number(row.averageRating) : null;
    map.set(String(row._id), {
      available: reviewCount > 0,
      averageRating: avg !== null ? Math.round(avg * 10) / 10 : null, // 1 decimal place for display
      reviewCount,
    });
  }
  return map;
}

async function getReviewAggregateForAccommodation(accommodationId) {
  if (!accommodationId) return buildEmptyRatingSummary();
  const map = await getReviewAggregatesByAccommodationIds([accommodationId]);
  return map.get(String(accommodationId)) || buildEmptyRatingSummary();
}

module.exports = {
  PUBLIC_REVIEW_MODERATION_STATUSES,
  buildEmptyRatingSummary,
  getReviewAggregatesByAccommodationIds,
  getReviewAggregateForAccommodation,
};
