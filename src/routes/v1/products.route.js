const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { productsController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-product',
  validate(productsController.createProduct.validation),
  catchAsync(productsController.createProduct.handler)
);

router.get(
  '/getall',
  catchAsync(productsController.getAllProducts.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(productsController.getProductById.handler)
);

router.put(
  '/update/:_id',
  validate(productsController.updateProduct.validation),
  catchAsync(productsController.updateProduct.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(productsController.deleteProduct.handler)
);

module.exports = router;
