const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireStudent } = require('../middleware/authorize');
const { validateObjectIdParam } = require('../middleware/validate');
const {
  getProfile,
  updateProfile,
  getFavourites,
  addFavourite,
  removeFavourite,
} = require('../controllers/student.controller');

const router = express.Router();

// All student routes require authenticated student account
router.use(authenticate, requireStudent);

// Profile (student can access/modify only their own profile via authenticated identity)
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);

// Favourites
router.get('/favourites', getFavourites);
router.post('/favourites/:accommodationId', validateObjectIdParam('accommodationId'), addFavourite);
router.delete('/favourites/:accommodationId', validateObjectIdParam('accommodationId'), removeFavourite);

module.exports = router;
