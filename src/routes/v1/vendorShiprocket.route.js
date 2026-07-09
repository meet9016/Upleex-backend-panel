const express = require('express');
const auth = require('../../middlewares/auth');
const vendorShiprocketController = require('../../controllers/vendorShiprocket.controller');

const router = express.Router();

// All routes require vendor authentication
router.use(auth('vendor'));

// Create or update vendor's pickup location in Shiprocket
router.post(
  '/pickup-location',
  vendorShiprocketController.upsertVendorPickupLocation
);

// Get vendor's Shiprocket profile
router.get(
  '/profile',
  vendorShiprocketController.getVendorProfile
);

// Auto-sync from KYC data
router.post(
  '/sync-from-kyc',
  vendorShiprocketController.syncFromKyc
);

module.exports = router;
