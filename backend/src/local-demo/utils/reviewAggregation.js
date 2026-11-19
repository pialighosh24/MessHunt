const { getCollections } = require('../store');
const { MODERATION_STATUS } = require('../../utils/constants');
const { sameId } = require('../ids');

const PUBLIC_REVIEW_MODERATION_STATUSES = Object.freeze([
  MODERATION_STATUS.NONE,
  MODERATION_STATUS.APPROVED,
]);

function buildEmptyRatingSummary() {
  return { available: false, averageRating: null, reviewCount: 0 };
}

function isEligiblePublicReview(review) {
  return review && PUBLIC_REVIEW_MODERATION_STATUSES.includes(review.moderationStatus || MODERATION_STATUS.NONE);
}

function getReviewAggregatesByAccommodationIds(accommodationIds = []) {
  const ids = Array.from(new Set((accommodationIds || []).filter(Boolean).map(String)));
  const map = new Map();
  if (ids.length === 0) return map;
  const { reviews } = getCollections();
  const grouped = new Map();
  for (const id of ids) grouped.set(id, { sum: 0, count: 0 });
  for (const review of reviews) {
    const accId = String(review.accommodation);
    if (!grouped.has(accId)) continue;
    if (!isEligiblePublicReview(review)) continue;
    const g = grouped.get(accId);
    g.sum += Number(review.rating || 0);
    g.count += 1;
  }
  for (const [id, g] of grouped.entries()) {
    if (g.count > 0) {
      const avg = g.sum / g.count;
      map.set(id, { available: true, averageRating: Math.round(avg * 10) / 10, reviewCount: g.count });
    } else {
      map.set(id, buildEmptyRatingSummary());
    }
  }
  return map;
}

function getReviewAggregateForAccommodation(accommodationId) {
  if (!accommodationId) return buildEmptyRatingSummary();
  const map = getReviewAggregatesByAccommodationIds([accommodationId]);
  return map.get(String(accommodationId)) || buildEmptyRatingSummary();
}

module.exports = {
  PUBLIC_REVIEW_MODERATION_STATUSES,
  buildEmptyRatingSummary,
  isEligiblePublicReview,
  getReviewAggregatesByAccommodationIds,
  getReviewAggregateForAccommodation,
};
