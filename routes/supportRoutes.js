const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');

const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
};

router.post('/feedback', requireLogin, supportController.submitFeedback);

module.exports = router;
