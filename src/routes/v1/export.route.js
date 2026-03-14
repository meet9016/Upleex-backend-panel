const express = require('express');
const auth = require('../../middlewares/auth');
const {
  exportProductsToExcel,
  exportProductsToPDF,
  exportQuotesToExcel,
  exportQuotesToPDF
} = require('../../controllers/export.controller');

const router = express.Router();

// Product export routes
router.get('/products/excel', auth(), exportProductsToExcel.handler);
router.get('/products/pdf', auth(), exportProductsToPDF.handler);

// Quote export routes  
router.get('/quotes/excel', auth(), exportQuotesToExcel.handler);
router.get('/quotes/pdf', auth(), exportQuotesToPDF.handler);

module.exports = router;