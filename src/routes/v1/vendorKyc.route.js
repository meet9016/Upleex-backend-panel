// routes/vendor/kyc.routes.js
const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const kycController = require('../../controllers/vendor/kyc.controller');
const locationController = require('../../controllers/vendor/location.controller');
const upload = require('../../middlewares/upload');
const auth = require('../../middlewares/auth');

const router = express.Router();

// KYC Routes
router.post(
  '/vendor-kyc',
  auth(),
  upload.fields([
    { name: 'pancard_front_image', maxCount: 1 },
    { name: 'aadharcard_front_image', maxCount: 1 },
    { name: 'aadharcard_back_image', maxCount: 1 },
    { name: 'gst_certificate_image', maxCount: 1 },
    { name: 'vendor_image', maxCount: 1 },
    { name: 'business_logo_image', maxCount: 1 },
  ]),
  validate(kycController.saveKyc.validation),
  catchAsync(kycController.saveKyc.handler)
);

router.post(
  '/vendor-single-details',
  auth(),
  catchAsync(kycController.getSingleKyc.handler)
);

router.get(
  '/vendor-single-details',
  auth(),
  catchAsync(kycController.getSingleKyc.handler)
);

router.get(
  '/vendor-kyc',
  catchAsync(kycController.listKyc.handler)
);

router.get(
  '/vendor-kyc/:_id',
  catchAsync(kycController.getKycById.handler)
);

router.put(
  '/vendor-kyc/:_id',
  validate(kycController.updateKyc.validation),
  catchAsync(kycController.updateKyc.handler)
);

router.delete(
  '/vendor-kyc/:_id',
  catchAsync(kycController.deleteKyc.handler)
);

// Super admin: change KYC status
router.post(
  '/change-status',
  validate(kycController.changeStatus.validation),
  catchAsync(kycController.changeStatus.handler)
);

// Location Routes
router.post(
  '/vendor-country-list',
  validate(locationController.countryList.validation),
  catchAsync(locationController.countryList.handler)
);

router.post(
  '/vendor-state-list',
  validate(locationController.stateList.validation),
  catchAsync(locationController.stateList.handler)
);

router.post(
  '/vendor-city-list',
  validate(locationController.cityList.validation),
  catchAsync(locationController.cityList.handler)
);

router.post(
  '/vendor-india-city-list',
  validate(locationController.indiaCityList.validation),
  catchAsync(locationController.indiaCityList.handler)
);




module.exports = router;