const express = require('express');
const {
  registerStudent,
  loginStudent,
  registerOwner,
  loginOwner,
  loginAdmin,
  getMe,
  logout,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Student authentication
router.post('/student/register', registerStudent);
router.post('/student/login', loginStudent);

// Owner authentication
router.post('/owner/register', registerOwner);
router.post('/owner/login', loginOwner);

// Admin authentication (no public admin registration)
router.post('/admin/login', loginAdmin);

// Shared authenticated operations
router.get('/me', authenticate, getMe);
router.post('/logout', authenticate, logout);

module.exports = router;
