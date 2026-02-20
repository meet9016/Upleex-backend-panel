const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const { questionController } = require('../../controllers');

const router = express.Router();

router.post('/create-question', validate(questionController.createQuestion.validation), catchAsync(questionController.createQuestion.handler));
// router.post('/create-question', auth(), validate(questionController.createQuestion.validation), catchAsync(questionController.createQuestion.handler));
router.get('/getall', catchAsync(questionController.getAllQuestion.handler));
router.get('/getById/:_id', catchAsync(questionController.getLiveCoursesById.handler));
router.put('/update/:_id', validate(questionController.updateQuestion.validation), catchAsync(questionController.updateQuestion.handler));
router.delete('/delete/:_id', catchAsync(questionController.deleteQuestion.handler));

module.exports = router;