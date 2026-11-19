const express = require('express');
const { getPublicAccommodations, getPublicAccommodationById } = require('../controllers/publicAccommodation.controller');

const router = express.Router();

router.get('/', getPublicAccommodations);
router.get('/:id', getPublicAccommodationById);

module.exports = router;
