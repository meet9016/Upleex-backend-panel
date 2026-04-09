const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { getQuoteController } = require('../../controllers');
const upload = require('../../middlewares/upload');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.post(
  '/create-quote',
  auth(),
  upload.none(),
  validate(getQuoteController.createGetQuote.validation),
  catchAsync(getQuoteController.createGetQuote.handler)
);

router.get(
  '/getall',
  auth(),
  catchAsync(getQuoteController.getAllQuotes.handler)
);
router.get(
  '/getallforadmin',
  catchAsync(getQuoteController.getAllQuotesForAdmin.handler)
);
router.get(
  '/getById/:_id',
  auth(),
  catchAsync(getQuoteController.getQuoteById.handler)
);

router.put(
  '/update/:_id',
  auth(),
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
  auth(),
  upload.none(),
  validate(getQuoteController.changeStatus.validation),
  catchAsync(getQuoteController.changeStatus.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(getQuoteController.deleteQuote.handler)
);

router.post(
  '/verify-payment',
  catchAsync(getQuoteController.verifyQuotePayment.handler)
);

module.exports = router;

