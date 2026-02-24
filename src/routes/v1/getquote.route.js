const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { getQuoteController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-quote',
  validate(getQuoteController.createGetQuote.validation),
  catchAsync(getQuoteController.createGetQuote.handler)
);

module.exports = router;

