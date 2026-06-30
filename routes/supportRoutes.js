const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        if (req.session.role === 'guest' && req.method !== 'GET') {
            return res.status(403).json({ error: 'Guest mode is read-only. Please log in or sign up to perform this action.', isGuestError: true });
        }
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
};

router.post('/feedback', requireLogin, supportController.submitFeedback);

module.exports = router;
