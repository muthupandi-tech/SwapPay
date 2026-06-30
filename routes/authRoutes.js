const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    next();
};

// POST routes for handling form submissions
router.post('/register', 
    authLimiter,
    [
        body('email').isEmail().withMessage('Please provide a valid email.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
        body('name').notEmpty().withMessage('Name is required.'),
        body('phone').notEmpty().withMessage('Phone is required.'),
        body('college').notEmpty().withMessage('College is required.')
    ],
    validate,
    authController.registerUser
);

router.post('/login', 
    authLimiter,
    [
        body('email').isEmail().withMessage('Please provide a valid email.'),
        body('password').notEmpty().withMessage('Password is required.')
    ],
    validate,
    authController.loginUser
);

router.get('/logout', authController.logoutUser);
router.get('/me', authController.getCurrentUser);
router.post('/guest-login', authController.guestLogin);

router.post('/verify-otp', 
    [
        body('email').isEmail(),
        body('otp').isLength({ min: 6, max: 6 })
    ],
    validate,
    authController.verifyOTP
);

router.post('/resend-otp', 
    authLimiter,
    [
        body('email').isEmail()
    ],
    validate,
    authController.resendOTP
);

// Password recovery routes
router.post('/forgot-password', 
    authLimiter,
    [
        body('email').isEmail().withMessage('Please provide a valid email.')
    ],
    validate,
    authController.forgotPassword
);

router.post('/reset-password', 
    [
        body('token').notEmpty(),
        body('password').isLength({ min: 6 }).withMessage('New password must be at least 6 characters.')
    ],
    validate,
    authController.resetPassword
);

module.exports = router;
