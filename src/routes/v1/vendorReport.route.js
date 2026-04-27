const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const vendorReportController = require('../../controllers/vendorReport.controller');

const router = express.Router();

// Get comprehensive vendor report
router.get(
  '/',
  auth('admin'),
  catchAsync(vendorReportController.getVendorReport)
);

module.exports = router;
