const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const servicePlansReportController = require('../../controllers/servicePlansReport.controller');

const router = express.Router();

// Get service plans report
router.get(
  '/',
  auth('admin'),
  servicePlansReportController.getServicePlansReport
);

module.exports = router;
