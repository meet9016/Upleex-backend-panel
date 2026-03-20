const express = require('express');
const validate = require('../../middlewares/validate');
const { serviceCategoriesController } = require('../../controllers');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');

const router = express.Router();

router
  .route('/getall')
  .get(catchAsync(serviceCategoriesController.getAllCategories.handler));

router
  .route('/create-category')
  .post(
    upload.single('image'),
    validate(serviceCategoriesController.createCategory.validation),
    catchAsync(serviceCategoriesController.createCategory.handler)
  );

router
  .route('/update/:id')
  .put(
    upload.single('image'),
    validate(serviceCategoriesController.updateCategory.validation),
    catchAsync(serviceCategoriesController.updateCategory.handler)
  );

router
  .route('/delete/:id')
  .delete(catchAsync(serviceCategoriesController.deleteCategory.handler));

router
  .route('/bulk-delete')
  .post(catchAsync(serviceCategoriesController.bulkDeleteCategories.handler));

module.exports = router;
