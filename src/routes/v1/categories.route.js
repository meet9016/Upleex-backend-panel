const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { categoriesController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post(
  '/create-category',
  upload.single('image'),
  validate(categoriesController.createCategory.validation),
  catchAsync(categoriesController.createCategory.handler)
);

router.get('/getall', catchAsync(categoriesController.getAllCategories.handler));

router.get(
  '/getById/:_id',
  catchAsync(categoriesController.getCategoryById.handler)
);

router.put(
  '/update/:_id',
  upload.single('image'),
  validate(categoriesController.updateCategory.validation),
  catchAsync(categoriesController.updateCategory.handler)
);

router.delete(
  '/delete/:_id',
  catchAsync(categoriesController.deleteCategory.handler)
);

module.exports = router;

