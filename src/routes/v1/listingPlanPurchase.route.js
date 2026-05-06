const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const listingPlanPurchaseController = require('../../controllers/listingPlanPurchase.controller');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.get(
  '/options',
  catchAsync(listingPlanPurchaseController.getPlanOptions.handler)
);

router.post(
  '/custom-request',
  auth(),
  upload.none(),
  validate(listingPlanPurchaseController.customPlanRequest.validation),
  catchAsync(listingPlanPurchaseController.customPlanRequest.handler)
);

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(listingPlanPurchaseController.createPurchase.validation),
  catchAsync(listingPlanPurchaseController.createPurchase.handler)
);

router.get(
  '/getall',
  auth(),
  validate(listingPlanPurchaseController.getAllPurchases.validation),
  catchAsync(listingPlanPurchaseController.getAllPurchases.handler)
);

router.get(
  '/vendor/purchases',
  auth(),
  catchAsync(listingPlanPurchaseController.getVendorListingPurchases.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(listingPlanPurchaseController.getPurchaseById.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(listingPlanPurchaseController.updatePurchase.validation),
  catchAsync(listingPlanPurchaseController.updatePurchase.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(listingPlanPurchaseController.deletePurchase.handler)
);

module.exports = router;
