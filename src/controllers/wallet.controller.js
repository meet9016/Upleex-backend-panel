const httpStatus = require('http-status');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const Wallet = require('../models/wallet.model');

// Initialize Razorpay
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: config.razorpay.keyId || process.env.RAZORPAY_KEY_ID,
    key_secret: config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET,
  });
  console.log('Razorpay initialized for wallet with key:', config.razorpay.keyId || process.env.RAZORPAY_KEY_ID);
} catch (error) {
  console.error('Failed to initialize Razorpay for wallet:', error);
}

// Generate unique transaction ID
const generateTransactionId = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `WLT${timestamp.slice(-6)}${random}`;
};

// Get wallet balance
const getWalletBalance = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view wallet balance');
  }

  const vendorId = req.user.id || req.user._id;
  
  // Find wallet - DO NOT auto-create
  let wallet = await Wallet.findOne({ vendor_id: vendorId });
  
  // If wallet doesn't exist, return zero balance instead of creating
  if (!wallet) {
    return res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Wallet balance fetched successfully',
      data: {
        balance: 0,
        currency: 'INR',
        total_credited: 0,
        total_debited: 0,
        transaction_count: 0,
        is_active: true,
      },
    });
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Wallet balance fetched successfully',
    data: {
      balance: wallet.balance,
      currency: wallet.currency,
      total_credited: wallet.total_credited,
      total_debited: wallet.total_debited,
      transaction_count: wallet.transaction_count,
      is_active: wallet.is_active,
    },
  });
});

// Create Razorpay order for adding money
const createAddMoneyOrder = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to add money');
  }

  const { amount } = req.body;
  const vendorId = req.user.id || req.user._id;

  // Validate amount
  if (!amount || amount < 50) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Minimum amount is ₹50');
  }

  // Find wallet - only create if it doesn't exist
  let wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    wallet = await Wallet.create({
      vendor_id: vendorId,
      balance: 0,
      currency: 'INR',
      transactions: [],
    });
  }

  // Generate transaction ID
  const transactionId = generateTransactionId();

  // Check if Razorpay keys are configured
  const razorpayKeyId = config.razorpay.keyId || process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret || razorpayKeyId === 'rzp_test_your_key_id_here' || razorpayKeyId.includes('your_key_id')) {
    console.error('Razorpay keys validation failed for wallet:', {
      keyId: razorpayKeyId,
      keySecret: razorpayKeySecret ? 'Present' : 'Missing'
    });
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Razorpay keys not configured properly');
  }

  try {
    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: transactionId,
      notes: {
        transaction_id: transactionId,
        vendor_id: vendorId,
        purpose: 'wallet_add_money',
        vendor_email: req.user.email || '',
      },
    });

    // Add pending transaction to wallet
    const pendingTransaction = {
      transaction_id: transactionId,
      type: 'credit',
      amount: amount,
      description: `Add money to wallet - ₹${amount}`,
      status: 'pending',
      razorpay_order_id: razorpayOrder.id,
      metadata: {
        purpose: 'add_money',
        created_by: vendorId,
      },
    };

    wallet.transactions.push(pendingTransaction);
    await wallet.save();

    console.log('Wallet add money order created:', {
      transaction_id: transactionId,
      vendor_id: vendorId,
      amount: amount,
      razorpay_order_id: razorpayOrder.id
    });

    res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Add money order created successfully',
      data: {
        transaction_id: transactionId,
        razorpay_order_id: razorpayOrder.id,
        amount: amount,
        currency: 'INR',
        key: razorpayKeyId,
      },
    });
  } catch (razorpayError) {
    console.error('Razorpay error for wallet:', razorpayError);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Razorpay error: ${razorpayError.message}`);
  }
});

// Verify payment and add money to wallet
const verifyAddMoneyPayment = catchAsync(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transaction_id } = req.body;

  console.log('🔍 Wallet payment verification started for transaction:', transaction_id);
  console.log('📋 Payment data:', { razorpay_order_id, razorpay_payment_id, transaction_id });

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !transaction_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing payment verification data');
  }

  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to verify payment');
  }

  const vendorId = req.user.id || req.user._id;

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    console.log('❌ Wallet payment signature verification failed');
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment signature');
  }

  console.log('✅ Wallet payment signature verified successfully');

  // Find wallet and transaction
  const wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
  }

  const transaction = wallet.transactions.find(t => t.transaction_id === transaction_id);
  if (!transaction) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
  }

  if (transaction.status === 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Transaction already completed');
  }

  console.log('📦 Transaction found:', {
    transaction_id: transaction.transaction_id,
    amount: transaction.amount,
    current_status: transaction.status
  });

  // Update transaction with payment details
  transaction.status = 'completed';
  transaction.razorpay_payment_id = razorpay_payment_id;
  transaction.razorpay_signature = razorpay_signature;
  transaction.metadata.completed_at = new Date();

  // Add money to wallet balance
  wallet.balance += transaction.amount;
  wallet.total_credited += transaction.amount;

  await wallet.save();

  console.log('💾 Wallet updated successfully:', {
    vendor_id: vendorId,
    new_balance: wallet.balance,
    amount_added: transaction.amount
  });

  console.log('🎉 Wallet payment verification completed successfully');

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Money added to wallet successfully',
    data: {
      transaction_id: transaction.transaction_id,
      amount: transaction.amount,
      new_balance: wallet.balance,
      status: transaction.status,
    },
  });
});

// Get wallet transactions
const getWalletTransactions = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view transactions');
  }

  const vendorId = req.user.id || req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const type = req.query.type; // 'credit' or 'debit'
  const status = req.query.status; // 'completed', 'pending', 'failed'

  // Find wallet
  const wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    return res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'No transactions found',
      data: {
        transactions: [],
        pagination: {
          page: 1,
          limit: limit,
          total: 0,
          pages: 0,
        },
      },
    });
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

  // Format transactions for response
  const formattedTransactions = paginatedTransactions.map(transaction => ({
    id: transaction._id,
    transaction_id: transaction.transaction_id,
    type: transaction.type,
    amount: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    date: transaction.createdAt,
    razorpay_payment_id: transaction.razorpay_payment_id || null,
    metadata: transaction.metadata || {},
  }));

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Transactions fetched successfully',
    data: {
      transactions: formattedTransactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Deduct money from wallet (for internal use - orders, etc.)
const deductMoney = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to deduct money');
  }

  const { amount, description, metadata = {} } = req.body;
  const vendorId = req.user.id || req.user._id;

  // Validate amount
  if (!amount || amount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid amount');
  }

  // Find wallet
  const wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found');
  }

  // Check balance
  if (wallet.balance < amount) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Insufficient wallet balance');
  }

  // Generate transaction ID
  const transactionId = generateTransactionId();

  try {
    // Deduct money using wallet method
    const transaction = wallet.deductMoney(amount, transactionId, description, metadata);
    await wallet.save();

    console.log('💰 Money deducted from wallet:', {
      vendor_id: vendorId,
      amount: amount,
      new_balance: wallet.balance,
      transaction_id: transactionId
    });

    res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Money deducted successfully',
      data: {
        transaction_id: transaction.transaction_id,
        amount: transaction.amount,
        new_balance: wallet.balance,
        description: transaction.description,
      },
    });
  } catch (error) {
    console.error('Error deducting money from wallet:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
});

// Get wallet summary for dashboard
const getWalletSummary = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view wallet summary');
  }

  const vendorId = req.user.id || req.user._id;
  
  // Find wallet - DO NOT auto-create
  let wallet = await Wallet.findOne({ vendor_id: vendorId });
  
  if (!wallet) {
    return res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Wallet summary fetched successfully',
      data: {
        balance: 0,
        currency: 'INR',
        total_credited: 0,
        total_debited: 0,
        this_month_credits: 0,
        this_month_debits: 0,
        recent_transactions: [],
        is_active: true,
      },
    });
  }

  // Get recent transactions (last 5)
  const recentTransactions = wallet.getRecentTransactions(5);

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

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Wallet summary fetched successfully',
    data: {
      balance: wallet.balance,
      currency: wallet.currency,
      total_credited: wallet.total_credited,
      total_debited: wallet.total_debited,
      this_month_credits: thisMonthCredits,
      this_month_debits: thisMonthDebits,
      recent_transactions: recentTransactions.map(t => ({
        id: t._id,
        transaction_id: t.transaction_id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        status: t.status,
        date: t.createdAt,
      })),
      is_active: wallet.is_active,
    },
  });
});

// Admin: Get all vendor wallets
const getAllVendorWallets = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const search = req.query.search || '';

  const skip = (page - 1) * limit;

  let searchQuery = {};
  if (search) {
    searchQuery = {
      $or: [
        { 'vendor_id.full_name': { $regex: search, $options: 'i' } },
        { 'vendor_id.business_name': { $regex: search, $options: 'i' } },
        { 'vendor_id.email': { $regex: search, $options: 'i' } },
      ]
    };
  }

  const total = await Wallet.countDocuments(searchQuery);

  const wallets = await Wallet.find(searchQuery)
    .populate('vendor_id', 'full_name business_name email')
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

  const formattedWallets = wallets.map(wallet => ({
    id: wallet._id,
    vendor_id: wallet.vendor_id?._id,
    vendor_name: wallet.vendor_id?.full_name || 'N/A',
    vendor_email: wallet.vendor_id?.email || 'N/A',
    balance: wallet.balance,
    currency: wallet.currency,
    total_credited: wallet.total_credited,
    total_debited: wallet.total_debited,
    transaction_count: wallet.transaction_count,
    is_active: wallet.is_active,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
  }));

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Vendor wallets fetched successfully',
    data: {
      wallets: formattedWallets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Admin: Get vendor wallet details
const getVendorWalletDetails = catchAsync(async (req, res) => {
  const { vendorId } = req.params;

  const wallet = await Wallet.findOne({ vendor_id: vendorId })
    .populate('vendor_id', 'full_name business_name email');
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found for this vendor');
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Vendor wallet details fetched successfully',
    data: {
      id: wallet._id,
      vendor_id: wallet.vendor_id?._id,
      vendor_name:  wallet.vendor_id?.full_name || 'N/A',
      vendor_email: wallet.vendor_id?.email || 'N/A',
      balance: wallet.balance,
      currency: wallet.currency,
      total_credited: wallet.total_credited,
      total_debited: wallet.total_debited,
      transaction_count: wallet.transaction_count,
      is_active: wallet.is_active,
      created_at: wallet.createdAt,
      updated_at: wallet.updatedAt,
    },
  });
});

// Admin: Get vendor wallet transactions
const getVendorWalletTransactions = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const type = req.query.type;
  const status = req.query.status;

  const wallet = await Wallet.findOne({ vendor_id: vendorId })
    .populate('vendor_id', 'full_name business_name email');
  if (!wallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Wallet not found for this vendor');
  }

  let transactions = [...wallet.transactions];

  if (type) {
    transactions = transactions.filter(t => t.type === type);
  }

  if (status) {
    transactions = transactions.filter(t => t.status === status);
  }

  transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = transactions.length;
  const skip = (page - 1) * limit;
  const paginatedTransactions = transactions.slice(skip, skip + limit);

  const formattedTransactions = paginatedTransactions.map(transaction => ({
    id: transaction._id,
    transaction_id: transaction.transaction_id,
    type: transaction.type,
    amount: transaction.amount,
    description: transaction.description,
    status: transaction.status,
    date: transaction.createdAt,
    razorpay_payment_id: transaction.razorpay_payment_id || null,
    metadata: transaction.metadata || {},
  }));

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Vendor wallet transactions fetched successfully',
    data: {
      vendor_name: wallet.vendor_id?.full_name || 'N/A',
      vendor_email: wallet.vendor_id?.email || 'N/A',
      transactions: formattedTransactions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

module.exports = {
  getWalletBalance,
  createAddMoneyOrder,
  verifyAddMoneyPayment,
  getWalletTransactions,
  deductMoney,
  getWalletSummary,
  getAllVendorWallets,
  getVendorWalletDetails,
  getVendorWalletTransactions,
};
