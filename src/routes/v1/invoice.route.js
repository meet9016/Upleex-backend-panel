const express = require('express');
const router = express.Router();
const { generateInvoicePDF } = require('../../controllers/invoiceController');
const auth = require('../../middlewares/auth');

router.post('/pdf', auth(false), generateInvoicePDF);

module.exports = router;
