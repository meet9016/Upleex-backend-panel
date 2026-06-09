const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const dynamicPageController = require('../../controllers/dynamicPage.controller');

const router = express.Router();

router
  .route('/')
  .post(
    auth(),
    validate(dynamicPageController.upsertDynamicPage.validation),
    catchAsync(dynamicPageController.upsertDynamicPage.handler)
  )
  .get(catchAsync(dynamicPageController.getAllDynamicPages.handler));

router
  .route('/:slug')
  .get(catchAsync(dynamicPageController.getDynamicPageBySlug.handler));

module.exports = router;
