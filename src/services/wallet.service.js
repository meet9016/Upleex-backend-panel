const Wallet = require('../models/wallet.model');
const ApiError = require('../utils/ApiError');
const httpStatus = require('http-status');

/**
 * Create wallet for vendor - only when needed
 * @param {string} vendorId
 * @returns {Promise<Wallet>}
 */
const createWalletForVendor = async (vendorId) => {
  if (!vendorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID is required');
  }
  
  return await Wallet.createWalletForVendor(vendorId);
};

/**
 * Get wallet by vendor ID - do not auto-create
 * @param {string} vendorId
 * @returns {Promise<Wallet>}
 */
const getWalletByVendorId = async (vendorId) => {
  if (!vendorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID is required');
  }

  let wallet = await Wallet.findOne({ vendor_id: vendorId });
  
  // Return null if wallet doesn't exist - don't auto-create
  return wallet;
};

/**
 * Check if vendor has sufficient balance
 * @param {string} vendorId
 * @param {number} amount
 * @returns {Promise<boolean>}
 */
const hasSufficientBalance = async (vendorId, amount) => {
  if (!vendorId || !amount) {
    return false;
  }

  const wallet = await getWalletByVendorId(vendorId);
  
  // If wallet doesn't exist, balance is 0
  if (!wallet) {
    return false;
  }
  
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
  if (!vendorId || !amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID and amount are required');
  }

  const wallet = await getWalletByVendorId(vendorId);
  
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found. Please add money to wallet first.');
  }
  
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance');
  }

  // Generate transaction ID
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `WLT${timestamp.slice(-6)}${random}`;

  try {
    const transaction = wallet.deductMoney(amount, transactionId, description, metadata);
    await wallet.save();

    return {
      transaction_id: transaction.transaction_id,
      amount: transaction.amount,
      new_balance: wallet.balance,
      description: transaction.description,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
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
  if (!vendorId || !amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID and amount are required');
  }

  let wallet = await getWalletByVendorId(vendorId);

  // Create wallet if it doesn't exist
  if (!wallet) {
    wallet = await createWalletForVendor(vendorId);
  }

  // Generate transaction ID
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `WLT${timestamp.slice(-6)}${random}`;

  try {
    const transaction = wallet.addMoney(amount, transactionId, description, paymentDetails);
    await wallet.save();

    return {
      transaction_id: transaction.transaction_id,
      amount: transaction.amount,
      new_balance: wallet.balance,
      description: transaction.description,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

/**
 * Get wallet balance
 * @param {string} vendorId
 * @returns {Promise<number>}
 */
const getWalletBalance = async (vendorId) => {
  if (!vendorId) {
    return 0;
  }

  const wallet = await getWalletByVendorId(vendorId);
  
  // Return 0 if wallet doesn't exist
  return wallet ? wallet.balance : 0;
};

/**
 * Get wallet transactions with pagination
 * @param {string} vendorId
 * @param {object} options
 * @returns {Promise<object>}
 */
const getWalletTransactions = async (vendorId, options = {}) => {
  if (!vendorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID is required');
  }

  const { page = 1, limit = 20, type, status } = options;
  
  const wallet = await getWalletByVendorId(vendorId);
  
  if (!wallet) {
    return {
      transactions: [],
      pagination: {
        page,
        limit,
        total: 0,
        pages: 0,
      },
    };
  }
  
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
  if (!vendorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor ID is required');
  }

  const wallet = await getWalletByVendorId(vendorId);
  
  if (!wallet) {
    return {
      current_balance: 0,
      total_credited: 0,
      total_debited: 0,
      this_month_credits: 0,
      this_month_debits: 0,
      last_30_days_transactions: 0,
      total_transactions: 0,
      completed_transactions: 0,
      pending_transactions: 0,
    };
  }
  
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
