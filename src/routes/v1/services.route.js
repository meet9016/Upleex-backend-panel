const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { servicesController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-service',
  auth(),
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'sub_images', maxCount: 4 }]),
  validate(servicesController.createService.validation),
  catchAsync(servicesController.createService.handler)
);

router.get(
  '/getall',
  auth(true), // Optional auth to detect vendor if logged in
  catchAsync(servicesController.getAllServices.handler)
);

router.get(
  '/getById/:id',
  catchAsync(servicesController.getServiceById.handler)
);

router.put(
  '/update/:id',
  auth(),
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'sub_images', maxCount: 4 }]),
  validate(servicesController.updateService.validation),
  catchAsync(servicesController.updateService.handler)
);

router.delete(
  '/delete/:id',
  auth(),
  catchAsync(servicesController.deleteService.handler)
);

module.exports = router;
