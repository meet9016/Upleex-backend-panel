const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const servicePriorityPlanController = require('../../controllers/servicePriorityPlan.controller');

const router = express.Router();

router.post('/create', auth(), validate(servicePriorityPlanController.createPlan.validation), catchAsync(servicePriorityPlanController.createPlan.handler));
router.get('/getall', catchAsync(servicePriorityPlanController.getAllPlans.handler));
router.put('/update/:_id', auth(), catchAsync(servicePriorityPlanController.updatePlan.handler));
router.delete('/delete/:_id', auth(), catchAsync(servicePriorityPlanController.deletePlan.handler));

module.exports = router;
