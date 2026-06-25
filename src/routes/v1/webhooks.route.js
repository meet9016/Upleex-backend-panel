const express = require('express');
const { handleRazorpayXWebhook } = require('../../controllers/webhook.controller');

const router = express.Router();

// RazorpayX webhook endpoint - no auth required (verified via signature)
router.post('/razorpayx', handleRazorpayXWebhook.handler);

module.exports = router;