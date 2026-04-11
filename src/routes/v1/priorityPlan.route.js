const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');
const priorityPlanController = require('../../controllers/priorityPlan.controller');

const router = express.Router();

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(priorityPlanController.createPriorityPlan.validation),
  catchAsync(priorityPlanController.createPriorityPlan.handler)
);

router.get(
  '/getall',
  validate(priorityPlanController.getAllPriorityPlans.validation),
  catchAsync(priorityPlanController.getAllPriorityPlans.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(priorityPlanController.updatePriorityPlan.validation),
  catchAsync(priorityPlanController.updatePriorityPlan.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(priorityPlanController.deletePriorityPlan.handler)
);

router.post(
  '/purchase',
  auth(),
  validate(priorityPlanController.purchasePriorityPlan.validation),
  catchAsync(priorityPlanController.purchasePriorityPlan.handler)
);

router.get(
  '/vendor/purchases',
  auth(),
  catchAsync(priorityPlanController.getVendorPriorityPurchases.handler)
);

router.get(
  '/purchases/getall',
  auth(),
  catchAsync(priorityPlanController.getAllPriorityPurchases.handler)
);

module.exports = router;
