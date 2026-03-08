const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Ensure user is authenticated
const requireLogin = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Unauthorized' });
    }
};
router.use(requireLogin);

// Fetch all notifications for the logged in user
router.get('/', notificationController.getNotifications);

// Mark a single notification as read
router.put('/read/:id', notificationController.markAsRead);

// Clear all notifications
router.delete('/', notificationController.clearAll);

module.exports = router;
