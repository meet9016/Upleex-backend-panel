const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');
const rentalBoostPlanController = require('../../controllers/rentalBoostPlan.controller');

const router = express.Router();

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(rentalBoostPlanController.createRentalBoostPlan.validation),
  catchAsync(rentalBoostPlanController.createRentalBoostPlan.handler)
);

router.get(
  '/getall',
  validate(rentalBoostPlanController.getAllRentalBoostPlans.validation),
  catchAsync(rentalBoostPlanController.getAllRentalBoostPlans.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(rentalBoostPlanController.updateRentalBoostPlan.validation),
  catchAsync(rentalBoostPlanController.updateRentalBoostPlan.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(rentalBoostPlanController.deleteRentalBoostPlan.handler)
);

router.post(
  '/purchase-bulk',
  auth(),
  validate(rentalBoostPlanController.purchaseBulkRentalBoostPlan.validation),
  catchAsync(rentalBoostPlanController.purchaseBulkRentalBoostPlan.handler)
);

router.get(
  '/vendor/purchases',
  auth(),
  catchAsync(rentalBoostPlanController.getVendorRentalBoostPurchases.handler)
);

module.exports = router;
