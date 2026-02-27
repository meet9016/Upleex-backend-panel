const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const adminController = require('../../controllers/admin.controller');

const router = express.Router();

router.post(
  '/register',
  validate(adminController.register.validation),
  catchAsync(adminController.register.handler)
);

router.post(
  '/login',
  validate(adminController.login.validation),
  catchAsync(adminController.login.handler)
);

// router.post(
//   '/send-otp',
//   validate(adminController.sendOtp.validation),
//   catchAsync(adminController.sendOtp.handler)
// );

// router.post(
//   '/verify-otp',
//   validate(adminController.verifyOtp.validation),
//   catchAsync(adminController.verifyOtp.handler)
// );

module.exports = router;

