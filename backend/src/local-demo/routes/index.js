const express = require('express');

const authRoutes = require('./auth.routes');
const studentRoutes = require('./student.routes');
const ownerRoutes = require('./owner.routes');
const publicAccommodationRoutes = require('./publicAccommodation.routes');
const accommodationReviewRoutes = require('./accommodationReview.routes');
const reviewRoutes = require('./review.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/students', studentRoutes);
router.use('/owners', ownerRoutes);
router.use('/accommodations', accommodationReviewRoutes);
router.use('/accommodations', publicAccommodationRoutes);
router.use('/reviews', reviewRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
