const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/vendor/auth.validation');
const authController = require('../../controllers/vendor/auth.controller');

const router = express.Router();

router.post(
  '/business-register',
  validate(authValidation.businessRegister),
  authController.businessRegister
);

router.post(
  '/vendor-login',
  validate(authValidation.vendorLogin),
  authController.vendorLogin
);

module.exports = router;
