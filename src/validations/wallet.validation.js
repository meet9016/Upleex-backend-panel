const Joi = require('joi');

const createAddMoneyOrder = {
  body: Joi.object().keys({
    amount: Joi.number().min(50).required().messages({
      'number.min': 'Minimum amount is ₹50',
      'any.required': 'Amount is required',
    }),
  }),
};

const verifyAddMoneyPayment = {
  body: Joi.object().keys({
    razorpay_order_id: Joi.string().required().messages({
      'any.required': 'Razorpay order ID is required',
    }),
    razorpay_payment_id: Joi.string().required().messages({
      'any.required': 'Razorpay payment ID is required',
    }),
    razorpay_signature: Joi.string().required().messages({
      'any.required': 'Razorpay signature is required',
    }),
    transaction_id: Joi.string().required().messages({
      'any.required': 'Transaction ID is required',
    }),
  }),
};

const deductMoney = {
  body: Joi.object().keys({
    amount: Joi.number().min(0.01).required().messages({
      'number.min': 'Amount must be greater than 0',
      'any.required': 'Amount is required',
    }),
    description: Joi.string().required().messages({
      'any.required': 'Description is required',
    }),
    metadata: Joi.object().optional(),
  }),
};

const getTransactions = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    type: Joi.string().valid('credit', 'debit').optional(),
    status: Joi.string().valid('completed', 'pending', 'failed').optional(),
  }),
};

module.exports = {
  createAddMoneyOrder,
  verifyAddMoneyPayment,
  deductMoney,
  getTransactions,
};