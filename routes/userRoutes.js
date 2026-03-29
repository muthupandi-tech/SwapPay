const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Middleware to check if user is logged in
const requireLoginAPI = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized route. Please login first.' });
    }
};

router.get('/profile', requireLoginAPI, userController.getProfile);
router.put('/profile', requireLoginAPI, userController.updateProfile);
router.put('/location', requireLoginAPI, userController.updateLocation);
router.post('/auto-match', requireLoginAPI, userController.updateAutoMatch);
router.get('/settings', requireLoginAPI, userController.getSettings);
router.post('/settings', requireLoginAPI, userController.updateSettings);

module.exports = router;
