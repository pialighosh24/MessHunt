const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireOwner } = require('../middleware/authorize');
const { validateObjectIdParam } = require('../middleware/validate');
const {
  createAccommodation,
  getMyAccommodations,
  getMyAccommodationById,
  updateMyAccommodation,
  deleteMyAccommodation,
  uploadAccommodationPhotos,
  deleteAccommodationPhoto,
  accommodationPhotoUploadMiddleware,
} = require('../controllers/ownerAccommodation.controller');

const router = express.Router();

// All owner accommodation routes require authenticated owner account
router.use(authenticate, requireOwner);

router.post('/accommodations', createAccommodation);
router.get('/accommodations', getMyAccommodations);
router.get('/accommodations/:id', validateObjectIdParam('id'), getMyAccommodationById);
router.patch('/accommodations/:id', validateObjectIdParam('id'), updateMyAccommodation);
router.delete('/accommodations/:id', validateObjectIdParam('id'), deleteMyAccommodation);

// Photo management (Cloudinary-backed, Step 9)
router.post(
  '/accommodations/:id/photos',
  validateObjectIdParam('id'),
  accommodationPhotoUploadMiddleware,
  uploadAccommodationPhotos
);
router.delete('/accommodations/:id/photos/:photoId', validateObjectIdParam('id'), deleteAccommodationPhoto);

module.exports = router;
