const express = require('express');
const catchAsync = require('../../utils/catchAsync');
const { getRentOrders, getSellOrders } = require('../../controllers/adminOrders.controller');

const router = express.Router();

// GET /admin/orders/rent  – all quotes (rent) for super admin
router.get('/rent', catchAsync(getRentOrders.handler));

// GET /admin/orders/sell  – all sell orders for super admin
router.get('/sell', catchAsync(getSellOrders.handler));

module.exports = router;
