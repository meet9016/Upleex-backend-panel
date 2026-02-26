const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { getQuoteController } = require('../../controllers');
const upload = require('../../middlewares/upload');

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
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'return_image', maxCount: 1 },
    { name: 'return_video', maxCount: 1 },
  ]),
  validate(getQuoteController.updateQuote.validation),
  catchAsync(getQuoteController.updateQuote.handler)
);

router.post(
  '/status-dropdown',
  catchAsync(getQuoteController.statusDropdown.handler)
);

router.post(
  '/change-status',
  upload.none(),
  validate(getQuoteController.changeStatus.validation),
  catchAsync(getQuoteController.changeStatus.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(getQuoteController.deleteQuote.handler)
);

module.exports = router;

