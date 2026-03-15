const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Middleware to ensure user is logged in
const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};

// Apply requireLogin middleware to all chat routes
router.use(requireLogin);

// Get chat history for a specific swap
router.get('/:swapId', chatController.getChatHistory);

module.exports = router;
