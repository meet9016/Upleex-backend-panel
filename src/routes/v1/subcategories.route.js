const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { subCategoriesController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/create-subcategory',
  upload.single('image'),
  validate(subCategoriesController.createSubCategory.validation),
  catchAsync(subCategoriesController.createSubCategory.handler)
);

router.get(
  '/getall',
  catchAsync(subCategoriesController.getAllSubCategories.handler)
);

router.get(
  '/getById/:_id',
  catchAsync(subCategoriesController.getSubCategoryById.handler)
);

router.put(
  '/update/:_id',
  upload.single('image'),
  validate(subCategoriesController.updateSubCategory.validation),
  catchAsync(subCategoriesController.updateSubCategory.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(subCategoriesController.deleteSubCategory.handler)
);

module.exports = router;

