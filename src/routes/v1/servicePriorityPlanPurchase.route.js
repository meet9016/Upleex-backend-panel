const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const servicePriorityPlanPurchaseController = require('../../controllers/servicePriorityPlanPurchase.controller');

const router = express.Router();

router.post('/create', auth(), validate(servicePriorityPlanPurchaseController.createPurchase.validation), catchAsync(servicePriorityPlanPurchaseController.createPurchase.handler));
router.get('/getall', auth(), catchAsync(servicePriorityPlanPurchaseController.getAllPurchases.handler));
router.post('/fix-existing', auth(), catchAsync(servicePriorityPlanPurchaseController.fixExistingPurchases.handler));

module.exports = router;
