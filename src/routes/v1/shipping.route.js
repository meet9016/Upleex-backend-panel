const express = require('express');
const shippingController = require('../../controllers/shipping.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

router.post('/calculate', auth(true), shippingController.calculateShippingCharge);

module.exports = router;
