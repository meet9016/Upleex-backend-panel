const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { wishlistController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/web-add-to-wishlist',
  upload.none(),
  auth(),
  catchAsync(wishlistController.addToWishlist)
);

router.post(
  '/web-wishlist-list',
  upload.none(),
  auth(),
  catchAsync(wishlistController.getWishlist)
);

router.post(
  '/web-remove-wishlist',
  upload.none(),
  auth(),
  catchAsync(wishlistController.removeFromWishlist)
);

router.post(
  '/web-toggle-wishlist',
  upload.none(),
  auth(),
  catchAsync(wishlistController.toggleWishlist)
);

router.post(
  '/web-check-wishlist',
  upload.none(),
  auth(),
  catchAsync(wishlistController.checkWishlistStatus)
);

module.exports = router;