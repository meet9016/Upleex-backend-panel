const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { productsController } = require('../../controllers');

const router = express.Router();

router.post(
  '/create-product',
  upload.fields([
    { name: 'product_main_image', maxCount: 1 },
    { name: 'image[]', maxCount: 4 }
  ]),
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
  upload.fields([
    { name: 'product_main_image', maxCount: 1 },
    { name: 'image[]', maxCount: 4 }
  ]),
  catchAsync(productsController.updateProduct.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(productsController.deleteProduct.handler)
);

module.exports = router;
