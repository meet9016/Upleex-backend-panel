const express = require('express');
const { getDashboardMetrics } = require('../../controllers/vendorDashboard.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Get vendor dashboard metrics
router.get('/metrics', auth('vendor'), getDashboardMetrics);

module.exports = router;
