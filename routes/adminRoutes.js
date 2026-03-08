const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// All routes are prefixed with /api/admin from server.js

router.get('/stats', adminController.getStats);
router.get('/report', adminController.generateReport);
router.get('/swaps', adminController.getAllSwaps);
router.delete('/swap/:id', adminController.deleteSwap);
router.get('/users', adminController.getAllUsers);
router.put('/block/:id', adminController.blockUser);
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

module.exports = router;
