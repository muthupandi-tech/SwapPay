const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST routes for handling form submissions
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);
router.get('/logout', authController.logoutUser);
router.get('/me', authController.getCurrentUser);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

module.exports = router;
