const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const servicePlanController = require('../../controllers/servicePlan.controller');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/create',
  auth(),
  upload.none(),
  validate(servicePlanController.createPlan.validation),
  catchAsync(servicePlanController.createPlan.handler)
);

router.get(
  '/getall',
  validate(servicePlanController.getAllPlans.validation),
  catchAsync(servicePlanController.getAllPlans.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(servicePlanController.getPlanById.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.none(),
  validate(servicePlanController.updatePlan.validation),
  catchAsync(servicePlanController.updatePlan.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(servicePlanController.deletePlan.handler)
);

module.exports = router;
