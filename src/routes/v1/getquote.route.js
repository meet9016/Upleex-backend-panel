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

router.get(
  '/getall',
  catchAsync(getQuoteController.getAllQuotes.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(getQuoteController.getQuoteById.handler)
);

router.put(
  '/update/:_id',
  validate(getQuoteController.updateQuote.validation),
  catchAsync(getQuoteController.updateQuote.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(getQuoteController.deleteQuote.handler)
);

module.exports = router;

