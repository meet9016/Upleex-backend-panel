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
  exportVendorReportToPDF,
  exportListingPlansToExcel,
  exportListingPlansToPDF,
  exportPriorityPurchasesToExcel,
  exportPriorityPurchasesToPDF,
  exportServicePriorityPurchasesToExcel,
  exportServicePriorityPurchasesToPDF,
  exportRentalBoostPurchasesToExcel,
  exportRentalBoostPurchasesToPDF,
  exportAllPlanPurchasesToExcel,
  exportAllPlanPurchasesToPDF,
  exportUsersToExcel,
  exportUsersToPDF
} = require('../../controllers/export.controller');

const router = express.Router();

// Product export routes
router.get('/products/excel', auth(), exportProductsToExcel.handler);
router.get('/products/pdf', auth(), exportProductsToPDF.handler);

// User export routes
router.get('/users/excel', auth('admin'), exportUsersToExcel.handler);
router.get('/users/pdf', auth('admin'), exportUsersToPDF.handler);

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

// All Plan Purchases Combined export routes
router.get('/all-plan-purchases/excel', auth('admin'), exportAllPlanPurchasesToExcel.handler);
router.get('/all-plan-purchases/pdf', auth('admin'), exportAllPlanPurchasesToPDF.handler);

// Vendor Plans Report export
const vendorPlansReportController = require('../../controllers/vendorPlansReport.controller');
router.get('/vendor-plans-report/excel', auth('admin'), vendorPlansReportController.exportVendorPlansReportExcel);
router.get('/vendor-plans-report/pdf', auth('admin'), vendorPlansReportController.exportVendorPlansReportPDF);

// Listing Plans export routes
router.get('/listing-plans/excel', auth('admin'), exportListingPlansToExcel.handler);
router.get('/listing-plans/pdf', auth('admin'), exportListingPlansToPDF.handler);
router.get('/listing-purchases/excel', auth('admin'), exportListingPlansToExcel.handler);
router.get('/listing-purchases/pdf', auth('admin'), exportListingPlansToPDF.handler);

// Priority Purchases export routes
router.get('/priority-purchases/excel', auth('admin'), exportPriorityPurchasesToExcel.handler);
router.get('/priority-purchases/pdf', auth('admin'), exportPriorityPurchasesToPDF.handler);

// Service Priority Purchases export routes
router.get('/service-priority-purchases/excel', auth('admin'), exportServicePriorityPurchasesToExcel.handler);
router.get('/service-priority-purchases/pdf', auth('admin'), exportServicePriorityPurchasesToPDF.handler);

// Rental Boost Purchases export routes
router.get('/rental-boost-purchases/excel', auth('admin'), exportRentalBoostPurchasesToExcel.handler);
router.get('/rental-boost-purchases/pdf', auth('admin'), exportRentalBoostPurchasesToPDF.handler);

module.exports = router;