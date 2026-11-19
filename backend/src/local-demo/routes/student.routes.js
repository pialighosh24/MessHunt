const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireStudent } = require('../middleware/authorize');
const { validateObjectIdParam } = require('../../middleware/validate');
const {
  getProfile,
  updateProfile,
  getFavourites,
  addFavourite,
  removeFavourite,
} = require('../controllers/student.controller');

const router = express.Router();

router.use(authenticate, requireStudent);

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.get('/favourites', getFavourites);
router.post('/favourites/:accommodationId', validateObjectIdParam('accommodationId'), addFavourite);
router.delete('/favourites/:accommodationId', validateObjectIdParam('accommodationId'), removeFavourite);

module.exports = router;
