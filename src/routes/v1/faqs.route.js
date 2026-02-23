const express = require('express');
const catchAsync = require('../../utils/catchAsync');
const { faqsController } = require('../../controllers');

const router = express.Router();

router.get(
  '/getall',
  catchAsync(faqsController.getAllFaqs.handler)
);

module.exports = router;

