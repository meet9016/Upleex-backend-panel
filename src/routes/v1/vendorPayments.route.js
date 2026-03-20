const express = require('express');
const {
  getVendorPayments,
  getAllVendorPayments,
  releasePayment,
  releaseOrderPayment,
  getPaymentStats,
  releaseScheduledPayments,
} = require('../../controllers/vendorPayment.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

// Vendor routes
router.get('/vendor', auth('vendor'), getVendorPayments.handler);
router.get('/vendor/stats', auth('vendor'), getPaymentStats.handler);

// Admin routes
router.get('/admin', auth('admin'), getAllVendorPayments.handler);
router.get('/admin/stats', auth('admin'), getPaymentStats.handler);
router.put('/admin/:paymentId/release', auth('admin'), releasePayment.handler);
router.put('/admin/order/:orderId/vendor/:vendorId/release', auth('admin'), releaseOrderPayment.handler);
router.post('/admin/release-scheduled', auth('admin'), releaseScheduledPayments.handler);

module.exports = router;