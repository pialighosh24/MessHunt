const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { validateObjectIdParam } = require('../../middleware/validate');
const {
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
} = require('../controllers/admin.controller');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/dashboard/stats', getDashboardStats);
router.get('/students', listStudents);
router.get('/students/:id', validateObjectIdParam('id'), getStudentById);
router.patch('/students/:id/status', validateObjectIdParam('id'), updateStudentStatus);
router.get('/owners', listOwners);
router.get('/owners/:id', validateObjectIdParam('id'), getOwnerById);
router.patch('/owners/:id/verification', validateObjectIdParam('id'), updateOwnerVerification);
router.patch('/owners/:id/status', validateObjectIdParam('id'), updateOwnerStatus);
router.get('/accommodations', listAccommodations);
router.get('/accommodations/:id', validateObjectIdParam('id'), getAccommodationById);
router.patch('/accommodations/:id/decision', validateObjectIdParam('id'), decideAccommodation);
router.get('/reviews', listReviews);
router.get('/reviews/:id', validateObjectIdParam('id'), getReviewById);
router.patch('/reviews/:id/moderation', validateObjectIdParam('id'), moderateReview);
router.patch('/reviews/:reviewId/reports/:reportIndex', validateObjectIdParam('reviewId'), updateReportHandlingStatus);

module.exports = router;
