const express = require('express');
const router = express.Router();
const { getTopVendorsByProducts } = require('../../controllers/vendor/topVendors.controller');

// GET /api/vendor/top-vendors - Get top 10 vendors by product count
router.get('/top-vendors', getTopVendorsByProducts);

module.exports = router;
