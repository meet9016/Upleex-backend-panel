const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { cartController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/web-add-to-cart',
  upload.none(),
  auth(),
  catchAsync(cartController.addToCart)
);

router.post(
  '/web-cart-list',
  upload.none(),
  auth(),
  catchAsync(cartController.listCart)
);

router.post(
  '/web-remove-cart',
  upload.none(),
  auth(),
  catchAsync(cartController.removeFromCart)
);

router.post(
  '/web-update-cart',
  upload.none(),
  auth(),
  catchAsync(cartController.updateCartItem)
);

module.exports = router;
