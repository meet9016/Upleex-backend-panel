const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const serviceListingPlanPurchaseController = require('../../controllers/serviceListingPlanPurchase.controller');

const router = express.Router();

router.post(
  '/create',
  auth(),
  validate(serviceListingPlanPurchaseController.createPurchase.validation),
  catchAsync(serviceListingPlanPurchaseController.createPurchase.handler)
);

router.get(
  '/getall',
  auth(),
  catchAsync(serviceListingPlanPurchaseController.getAllPurchases.handler)
);

module.exports = router;
