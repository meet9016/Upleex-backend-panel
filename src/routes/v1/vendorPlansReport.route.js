const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const vendorPlansReportController = require('../../controllers/vendorPlansReport.controller');

const router = express.Router();

// Get comprehensive vendor plans report
router.get(
  '/',
  auth('admin'),
  vendorPlansReportController.getVendorPlansReport
);

module.exports = router;
