const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { dropdownsController } = require('../../controllers');

const router = express.Router();

router.get(
  '/',
  catchAsync(dropdownsController.getDropdowns.handler)
);

router.post(
  '/',
  validate(dropdownsController.createDropdowns.validation),
  catchAsync(dropdownsController.createDropdowns.handler)
);

router.put(
  '/',
  validate(dropdownsController.updateDropdowns.validation),
  catchAsync(dropdownsController.updateDropdowns.handler)
);

router.delete(
  '/',
  validate(dropdownsController.deleteDropdowns.validation),
  catchAsync(dropdownsController.deleteDropdowns.handler)
);

module.exports = router;

