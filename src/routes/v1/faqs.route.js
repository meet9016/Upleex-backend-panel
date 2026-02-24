const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { faqsController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-faq',
  validate(faqsController.createFaq.validation),
  catchAsync(faqsController.createFaq.handler)
);

router.get(
  '/getall',
  catchAsync(faqsController.getAllFaqs.handler)
);

router.put(
  '/update/:_id',
  validate(faqsController.updateFaq.validation),
  catchAsync(faqsController.updateFaq.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(faqsController.deleteFaq.handler)
);

module.exports = router;

