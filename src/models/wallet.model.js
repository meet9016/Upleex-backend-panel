const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  transaction_id: {
    type: String,
    required: true,
    sparse: true,  // Allow multiple null values
  },
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed'],
    default: 'pending',
  },
  razorpay_payment_id: {
    type: String,
  },
  razorpay_order_id: {
    type: String,
  },
  razorpay_signature: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

const walletSchema = new mongoose.Schema({
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    unique: true,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR',
  },
  total_credited: {
    type: Number,
    default: 0,
    min: 0,
  },
  total_debited: {
    type: Number,
    default: 0,
    min: 0,
  },
  transactions: [walletTransactionSchema],
  is_active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

// Index for better performance - use sparse for transaction_id to allow multiple nulls
walletSchema.index({ vendor_id: 1 });
walletSchema.index({ 'transactions.transaction_id': 1, sparse: true });
walletSchema.index({ 'transactions.status': 1 });
walletSchema.index({ 'transactions.type': 1 });

// Virtual for transaction count
walletSchema.virtual('transaction_count').get(function() {
  return this.transactions.length;
});

// Method to add money to wallet
walletSchema.methods.addMoney = function(amount, transactionId, description, paymentDetails = {}) {
  if (!transactionId || !amount) {
    throw new Error('Transaction ID and amount are required');
  }

  const transaction = {
    transaction_id: transactionId,
    type: 'credit',
    amount: amount,
    description: description,
    status: 'completed',
    razorpay_payment_id: paymentDetails.razorpay_payment_id || null,
    razorpay_order_id: paymentDetails.razorpay_order_id || null,
    razorpay_signature: paymentDetails.razorpay_signature || null,
    metadata: paymentDetails.metadata || {},
  };
  
  this.transactions.push(transaction);
  this.balance += amount;
  this.total_credited += amount;
  
  return transaction;
};

// Method to deduct money from wallet
walletSchema.methods.deductMoney = function(amount, transactionId, description, metadata = {}) {
  if (!transactionId || !amount) {
    throw new Error('Transaction ID and amount are required');
  }

  if (this.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }
  
  const transaction = {
    transaction_id: transactionId,
    type: 'debit',
    amount: amount,
    description: description,
    status: 'completed',
    metadata: metadata,
  };
  
  this.transactions.push(transaction);
  this.balance -= amount;
  this.total_debited += amount;
  
  return transaction;
};

// Method to get recent transactions
walletSchema.methods.getRecentTransactions = function(limit = 10) {
  return this.transactions
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
};

// Static method to create wallet for vendor - only create if doesn't exist
walletSchema.statics.createWalletForVendor = async function(vendorId) {
  if (!vendorId) {
    throw new Error('Vendor ID is required');
  }

  const existingWallet = await this.findOne({ vendor_id: vendorId });
  if (existingWallet) {
    return existingWallet;
  }
  
  return await this.create({
    vendor_id: vendorId,
    balance: 0,
    currency: 'INR',
    transactions: [],
  });
};

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
