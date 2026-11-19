const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireStudent } = require('../middleware/authorize');
const { createReview, getAccommodationReviews } = require('../controllers/review.controller');

const router = express.Router({ mergeParams: true });

// Public: list eligible reviews for an approved accommodation
router.get('/:id/reviews', getAccommodationReviews);

// Student only: create review for an approved accommodation
router.post('/:id/reviews', authenticate, requireStudent, createReview);

module.exports = router;
