const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const listingPlanController = require('../../controllers/listingPlan.controller');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(listingPlanController.createPlan.validation),
  catchAsync(listingPlanController.createPlan.handler)
);

router.get(
  '/getall',
  validate(listingPlanController.getAllPlans.validation),
  catchAsync(listingPlanController.getAllPlans.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(listingPlanController.getPlanById.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(listingPlanController.updatePlan.validation),
  catchAsync(listingPlanController.updatePlan.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(listingPlanController.deletePlan.handler)
);

module.exports = router;
