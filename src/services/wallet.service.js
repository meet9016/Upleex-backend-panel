const Wallet = require('../models/wallet.model');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Create wallet for vendor
 * @param {string} vendorId
 * @returns {Promise<Wallet>}
 */
const createWalletForVendor = async (vendorId) => {
  return await Wallet.createWalletForVendor(vendorId);
};

/**
 * Get wallet by vendor ID
 * @param {string} vendorId
 * @returns {Promise<Wallet>}
 */
const getWalletByVendorId = async (vendorId) => {
  let wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    wallet = await createWalletForVendor(vendorId);
  }
  return wallet;
};

/**
 * Check if vendor has sufficient balance
 * @param {string} vendorId
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
const hasSufficientBalance = async (vendorId, amount) => {
  const wallet = await getWalletByVendorId(vendorId);
  return wallet.balance >= amount;
};

/**
 * Deduct money from vendor wallet
 * @param {string} vendorId
 * @param {number} amount
 * @param {string} description
 * @param {object} metadata
 * @returns {Promise<object>}
 */
const deductMoneyFromWallet = async (vendorId, amount, description, metadata = {}) => {
  const wallet = await getWalletByVendorId(vendorId);
  
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance');
  }

  // Generate transaction ID
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `WLT${timestamp.slice(-6)}${random}`;

  const transaction = wallet.deductMoney(amount, transactionId, description, metadata);
  await wallet.save();

  return {
    transaction_id: transaction.transaction_id,
    amount: transaction.amount,
    new_balance: wallet.balance,
    description: transaction.description,
  };
};

/**
 * Add money to vendor wallet (for internal use - like order payments)
 * @param {string} vendorId
 * @param {number} amount
 * @param {string} description
 * @param {object} paymentDetails
 * @returns {Promise<object>}
 */
const addMoneyToWallet = async (vendorId, amount, description, paymentDetails = {}) => {
  const wallet = await getWalletByVendorId(vendorId);

  // Generate transaction ID
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `WLT${timestamp.slice(-6)}${random}`;

  const transaction = wallet.addMoney(amount, transactionId, description, paymentDetails);
  await wallet.save();

  return {
    transaction_id: transaction.transaction_id,
    amount: transaction.amount,
    new_balance: wallet.balance,
    description: transaction.description,
  };
};

/**
 * Get wallet balance
 * @param {string} vendorId
 * @returns {Promise<number>}
 */
const getWalletBalance = async (vendorId) => {
  const wallet = await getWalletByVendorId(vendorId);
  return wallet.balance;
};

/**
 * Get wallet transactions with pagination
 * @param {string} vendorId
 * @param {object} options
 * @returns {Promise<object>}
 */
const getWalletTransactions = async (vendorId, options = {}) => {
  const { page = 1, limit = 20, type, status } = options;
  
  const wallet = await getWalletByVendorId(vendorId);
  
  // Filter transactions
  let transactions = [...wallet.transactions];
  
  if (type) {
    transactions = transactions.filter(t => t.type === type);
  }
  
  if (status) {
    transactions = transactions.filter(t => t.status === status);
  }

  // Sort by creation date (newest first)
  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const total = transactions.length;
  const skip = (page - 1) * limit;
  const paginatedTransactions = transactions.slice(skip, skip + limit);

  return {
    transactions: paginatedTransactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Process vendor payment from order
 * @param {string} vendorId
 * @param {number} amount
 * @param {string} orderId
 * @param {object} orderDetails
 * @returns {Promise<object>}
 */
const processVendorPayment = async (vendorId, amount, orderId, orderDetails = {}) => {
  const description = `Payment received for order ${orderId}`;
  const paymentDetails = {
    metadata: {
      purpose: 'order_payment',
      order_id: orderId,
      ...orderDetails,
    },
  };

  return await addMoneyToWallet(vendorId, amount, description, paymentDetails);
};

/**
 * Process refund to vendor wallet
 * @param {string} vendorId
 * @param {number} amount
 * @param {string} orderId
 * @param {string} reason
 * @returns {Promise<object>}
 */
const processRefund = async (vendorId, amount, orderId, reason = 'Order refund') => {
  const description = `Refund for order ${orderId}: ${reason}`;
  const paymentDetails = {
    metadata: {
      purpose: 'refund',
      order_id: orderId,
      reason: reason,
    },
  };

  return await addMoneyToWallet(vendorId, amount, description, paymentDetails);
};

/**
 * Get wallet statistics
 * @param {string} vendorId
 * @returns {Promise<object>}
 */
const getWalletStatistics = async (vendorId) => {
  const wallet = await getWalletByVendorId(vendorId);
  
  // Calculate this month's activity
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setHours(0, 0, 0, 0);

  const thisMonthTransactions = wallet.transactions.filter(t => 
    new Date(t.createdAt) >= currentMonth && t.status === 'completed'
  );

  const thisMonthCredits = thisMonthTransactions
    .filter(t => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  const thisMonthDebits = thisMonthTransactions
    .filter(t => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  // Calculate last 30 days activity
  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const last30DaysTransactions = wallet.transactions.filter(t => 
    new Date(t.createdAt) >= last30Days && t.status === 'completed'
  );

  return {
    current_balance: wallet.balance,
    total_credited: wallet.total_credited,
    total_debited: wallet.total_debited,
    this_month_credits: thisMonthCredits,
    this_month_debits: thisMonthDebits,
    last_30_days_transactions: last30DaysTransactions.length,
    total_transactions: wallet.transactions.length,
    completed_transactions: wallet.transactions.filter(t => t.status === 'completed').length,
    pending_transactions: wallet.transactions.filter(t => t.status === 'pending').length,
  };
};

module.exports = {
  createWalletForVendor,
  getWalletByVendorId,
  hasSufficientBalance,
  deductMoneyFromWallet,
  addMoneyToWallet,
  getWalletBalance,
  getWalletTransactions,
  processVendorPayment,
  processRefund,
  getWalletStatistics,
};