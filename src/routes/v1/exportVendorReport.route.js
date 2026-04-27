const express = require('express');
const { exportVendorReportExcel, exportVendorReportPDF } = require('../../controllers/exportVendorReport.controller');

const router = express.Router();

router.get('/vendor-report/excel', exportVendorReportExcel);
router.get('/vendor-report/pdf', exportVendorReportPDF);

module.exports = router;
