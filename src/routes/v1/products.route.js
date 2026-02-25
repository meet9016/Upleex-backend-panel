const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { productsController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-product',
  auth(),
  upload.fields([
    { name: 'product_main_image', maxCount: 1 },
    { name: 'image', maxCount: 4 }
  ]),
  validate(productsController.createProduct.validation),
  catchAsync(productsController.createProduct.handler)
);

router.get(
  '/getall',
  auth(true), // Optional auth to detect vendor if logged in
  catchAsync(productsController.getAllProducts.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(productsController.getProductById.handler)
);

router.put(
  '/update/:_id',
  auth(),
  upload.fields([
    { name: 'product_main_image', maxCount: 1 },
    { name: 'image', maxCount: 4 }
  ]),
  validate(productsController.updateProduct.validation),
  catchAsync(productsController.updateProduct.handler)
);

router.delete(
  '/delete/:_id',
  auth(),
  catchAsync(productsController.deleteProduct.handler)
);

module.exports = router;
