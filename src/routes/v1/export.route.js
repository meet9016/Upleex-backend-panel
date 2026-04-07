const express = require('express');
const auth = require('../../middlewares/auth');
const {
  exportProductsToExcel,
  exportProductsToPDF,
  exportQuotesToExcel,
  exportQuotesToPDF,
  exportOrdersToExcel,
  exportOrdersToPDF,
  exportPaymentsToExcel,
  exportPaymentsToPDF,
  exportWalletTransactionsToExcel,
  exportWalletTransactionsToPDF,
  exportServicesToExcel,
  exportServicesToPDF
} = require('../../controllers/export.controller');

const router = express.Router();

// Product export routes
router.get('/products/excel', auth(), exportProductsToExcel.handler);
router.get('/products/pdf', auth(), exportProductsToPDF.handler);

// Quote export routes  
router.get('/quotes/excel', auth(), exportQuotesToExcel.handler);
router.get('/quotes/pdf', auth(), exportQuotesToPDF.handler);

// Order & Payment export routes
router.get('/orders/excel', auth(), exportOrdersToExcel.handler);
router.get('/orders/pdf', auth(), exportOrdersToPDF.handler);
router.get('/payments/excel', auth(), exportPaymentsToExcel.handler);
router.get('/payments/pdf', auth(), exportPaymentsToPDF.handler);

// Wallet Transactions export routes
router.get('/wallet-transactions/excel', auth(), exportWalletTransactionsToExcel.handler);
router.get('/wallet-transactions/pdf', auth(), exportWalletTransactionsToPDF.handler);

// Service export routes
router.get('/services/excel', auth(), exportServicesToExcel.handler);
router.get('/services/pdf', auth(), exportServicesToPDF.handler);

module.exports = router;