const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
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

// Permission management routes
router.post(
  '/assign-permissions',
  auth(),
  validate(adminController.assignPermissions.validation),
  catchAsync(adminController.assignPermissions.handler)
);

router.get(
  '/available-pages',
  auth(),
  catchAsync(adminController.getAvailablePages.handler)
);

router.get(
  '/all-admins',
  auth(),
  catchAsync(adminController.getAllAdmins.handler)
);

router.get(
  '/my-permissions',
  auth(),
  catchAsync(adminController.getMyPermissions.handler)
);



module.exports = router;

