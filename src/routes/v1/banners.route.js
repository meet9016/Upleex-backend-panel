const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const { bannerController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create-banner', upload.single("image"), validate(bannerController.createBanner.validation), catchAsync(bannerController.createBanner.handler));
router.get('/getall', catchAsync(bannerController.getAllBanners.handler));
router.get('/getById/:_id', catchAsync(bannerController.getBannerById.handler));
router.put('/update/:_id', upload.single("image"), validate(bannerController.updateBanner.validation), catchAsync(bannerController.updateBanner.handler));
router.delete('/delete/:_id', catchAsync(bannerController.deleteBanner.handler));
router.delete(
  '/bulk-delete',
  validate(bannerController.bulkDeleteBanners.validation),
  catchAsync(bannerController.bulkDeleteBanners.handler)
);

module.exports = router;
