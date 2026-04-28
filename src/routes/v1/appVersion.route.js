const express = require('express');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const { getAppVersion, updateAppVersion } = require('../../controllers/appVersion.controller');

const router = express.Router();

router.get('/', catchAsync(getAppVersion));
router.post('/', auth('admin'), catchAsync(updateAppVersion));

module.exports = router;
