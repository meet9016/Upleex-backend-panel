const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const walletValidation = require('../../validations/wallet.validation');
const walletController = require('../../controllers/wallet.controller');

const router = express.Router();

// Get wallet balance
router.get('/balance', auth(), walletController.getWalletBalance);

// Get wallet summary for dashboard
router.get('/summary', auth(), walletController.getWalletSummary);

// Get wallet transactions
router.get('/transactions', auth(), walletController.getWalletTransactions);

// Create Razorpay order for adding money
router.post('/add-money', auth(), validate(walletValidation.createAddMoneyOrder), walletController.createAddMoneyOrder);

// Verify payment and add money to wallet
router.post('/verify-payment', auth(), validate(walletValidation.verifyAddMoneyPayment), walletController.verifyAddMoneyPayment);

// Deduct money from wallet (internal use)
router.post('/deduct-money', auth(), validate(walletValidation.deductMoney), walletController.deductMoney);

module.exports = router;