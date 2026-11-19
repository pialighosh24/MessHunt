const express = require('express');
const {
  getPublicAccommodations,
  getPublicAccommodationById,
} = require('../controllers/publicAccommodation.controller');

const router = express.Router();

// Public endpoints (approved and publicly available listings only)
router.get('/', getPublicAccommodations);
router.get('/:id', getPublicAccommodationById);

module.exports = router;
