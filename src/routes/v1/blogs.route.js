const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { blogsController } = require('../../controllers');
const upload = require('../../middlewares/upload');

const router = express.Router();

router.post('/create-blogs', upload.single("image"), validate(blogsController.createBlogs.validation), catchAsync(blogsController.createBlogs.handler));
router.get('/getall', catchAsync(blogsController.getAllBlogs.handler));
router.get('/getById/:_id', catchAsync(blogsController.getBlogById.handler));
router.put('/update/:_id', upload.single("image"), validate(blogsController.updateBlogs.validation), catchAsync(blogsController.updateBlogs.handler));
router.delete('/delete/:_id', catchAsync(blogsController.deleteBlogs.handler));

module.exports = router;