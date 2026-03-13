const express = require('express');
const router = express.Router();
const swapController = require('../controllers/swapController');

// Middleware to ensure user is authenticated before accessing swap APIs
const requireAuthAPI = (req, res, next) => {
    console.log('--- requireAuthAPI middleware hit for path:', req.path);
    if (req.session && req.session.userId) {
        console.log('User is authenticated:', req.session.userId);
        return next();
    } else {
        console.log('User is NOT authenticated.');
        return res.status(401).json({ error: 'Unauthorized access.' });
    }
};

// Apply auth middleware to all swap routes
router.use(requireAuthAPI);

// POST requests
router.post('/createSwap', swapController.createSwap);
router.post('/completeSwap/:id', swapController.completeSwap);
router.post('/rateSwap/:id', swapController.rateSwap);

// GET requests
router.get('/nearby', swapController.getNearbySwaps);
router.get('/stats', swapController.getDashboardStats);
router.get('/mySwaps', swapController.getMySwaps);
router.get('/notifications', swapController.getNotifications);
router.post('/notifications/read/:id', swapController.markNotificationRead);

// Partner Selection
router.get('/availablePartners/:id', swapController.getAvailablePartners);
router.post('/confirmPartners', swapController.confirmPartnerSelection);

module.exports = router;
