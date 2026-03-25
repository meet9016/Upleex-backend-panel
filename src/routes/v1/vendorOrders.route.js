const express = require('express');
const {
  getVendorOrders,
  updateOrderStatus,
  getOrderDetails,
  getDeliveryStatusOptions,
  bulkUpdateOrderStatus,
} = require('../../controllers/vendorOrder.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Get vendor orders with filtering and pagination
router.get('/', auth('vendor'), getVendorOrders.handler);

// Get delivery status options
router.get('/status-options', auth('vendor'), getDeliveryStatusOptions.handler);

// Get specific order details
router.get('/:orderId', auth('vendor'), getOrderDetails.handler);

// Update order status
router.put('/:orderId/status', auth('vendor'), updateOrderStatus.handler);

// Bulk update order status
router.put('/bulk/status', auth('vendor'), bulkUpdateOrderStatus.handler);

module.exports = router;