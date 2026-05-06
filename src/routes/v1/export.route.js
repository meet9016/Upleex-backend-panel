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
  exportServicesToPDF,
  exportVendorsToExcel,
  exportVendorsToPDF,
  exportVendorWalletsToExcel,
  exportVendorWalletsToPDF,
  exportVendorReportToExcel,
  exportVendorReportToPDF
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

// Vendor Wallets export routes (All wallets summary)
router.get('/vendor-wallets/excel', auth(), exportVendorWalletsToExcel.handler);
router.get('/vendor-wallets/pdf', auth(), exportVendorWalletsToPDF.handler);

// Service export routes
router.get('/services/excel', auth(), exportServicesToExcel.handler);
router.get('/services/pdf', auth(), exportServicesToPDF.handler);

// Vendor export routes
router.get('/vendors/excel', auth(), exportVendorsToExcel.handler);
router.get('/vendors/pdf', auth(), exportVendorsToPDF.handler);

// Vendor Report export routes
router.get('/vendor-report/excel', auth('admin'), exportVendorReportToExcel.handler);
router.get('/vendor-report/pdf', auth('admin'), exportVendorReportToPDF.handler);

module.exports = router;