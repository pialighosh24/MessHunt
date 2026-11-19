const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireStudent } = require('../middleware/authorize');
const { validateObjectIdParam } = require('../../middleware/validate');
const { updateReview, deleteReview, reportReview } = require('../controllers/review.controller');

const router = express.Router();

// Review owner (student) actions
router.patch('/:reviewId', authenticate, requireStudent, validateObjectIdParam('reviewId'), updateReview);
router.delete('/:reviewId', authenticate, requireStudent, validateObjectIdParam('reviewId'), deleteReview);

// Any authenticated student can report another student's review
router.post('/:reviewId/report', authenticate, requireStudent, validateObjectIdParam('reviewId'), reportReview);

module.exports = router;
