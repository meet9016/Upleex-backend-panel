const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { productsController } = require('../../controllers');
const productApprovalController = require('../../controllers/productApproval.controller');

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

router.post(
  '/bulk-deactivate',
  auth(),
  upload.none(),
  validate(productsController.bulkDeactivateProducts.validation),
  catchAsync(productsController.bulkDeactivateProducts.handler)
);

router.post(
  '/bulk-delete',
  auth(),
  upload.none(),
  validate(productsController.bulkDeleteProducts.validation),
  catchAsync(productsController.bulkDeleteProducts.handler)
);

// router.post(
//   '/purchase-plan',
//   auth(),
//   upload.none(),
//   validate(productsController.purchaseListingPlan.validation),
//   catchAsync(productsController.purchaseListingPlan.handler)
// );
router.post(
  '/web-vendor-product-list',
  upload.none(),
  validate(productsController.getVendorProducts.validation),
  catchAsync(productsController.getVendorProducts.handler),
  catchAsync(productsController.getVendorProducts.handler)
);

router.post(
  '/web-vendor-products',
  upload.none(),
  validate(productsController.getVendorProducts.validation),
  catchAsync(productsController.getVendorProducts.handler)
);

// Admin approval routes
router.get(
  '/vendors/getall',
  auth(),
  catchAsync(productApprovalController.getAllVendors.handler)
);

router.get(
  '/vendor/:vendorId',
  auth(),
  catchAsync(productApprovalController.getVendorProducts.handler)
);

router.put(
  '/approve/:productId',
  auth(),
  catchAsync(productApprovalController.approveProduct.handler)
);

router.post(
  '/bulk-approve',
  auth(),
  validate(productApprovalController.bulkApproveProducts.validation),
  catchAsync(productApprovalController.bulkApproveProducts.handler)
);

router.post(
  '/bulk-reject',
  auth(),
  validate(productApprovalController.bulkRejectProducts.validation),
  catchAsync(productApprovalController.bulkRejectProducts.handler)
);


module.exports = router;
