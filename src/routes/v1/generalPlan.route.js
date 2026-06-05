const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const generalPlanController = require('../../controllers/generalPlan.controller');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(generalPlanController.createPlan.validation),
  catchAsync(generalPlanController.createPlan.handler)
);

router.get(
  '/getall',
  validate(generalPlanController.getAllPlans.validation),
  catchAsync(generalPlanController.getAllPlans.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(generalPlanController.getPlanById.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(generalPlanController.updatePlan.validation),
  catchAsync(generalPlanController.updatePlan.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(generalPlanController.deletePlan.handler)
);

router.post(
  '/purchase',
  auth(),
  validate(generalPlanController.purchaseGeneralPlan.validation),
  catchAsync(generalPlanController.purchaseGeneralPlan.handler)
);

router.get(
  '/vendor-purchases',
  auth(),
  catchAsync(generalPlanController.getVendorPurchases.handler)
);

module.exports = router;
