const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { addressController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/web-add-address',
  upload.none(),
  auth(),
  catchAsync(addressController.addAddress)
);

router.post(
  '/web-list-addresses',
  upload.none(),
  auth(),
  catchAsync(addressController.listAddresses)
);

router.post(
  '/web-update-address',
  upload.none(),
  auth(),
  catchAsync(addressController.updateAddress)
);

router.post(
  '/web-delete-address',
  upload.none(),
  auth(),
  catchAsync(addressController.deleteAddress)
);

router.post(
  '/web-set-default-address',
  upload.none(),
  auth(),
  catchAsync(addressController.setDefaultAddress)
);

module.exports = router;
