const express = require('express');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const auth = require('../../middlewares/auth');
const paymentController = require('../../controllers/payment.controller');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const createOrderValidation = {
  body: Joi.object().keys({
    order_notes: Joi.string().allow('').optional(),
    payment_type: Joi.string().valid('full', '30_percent').default('full').optional(),
  }).options({ allowUnknown: true }),
};

const verifyPaymentValidation = {
  body: Joi.object().keys({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
    order_id: Joi.string().required(),
  }),
};

const getOrdersValidation = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

const cancelOrderValidation = {
  params: Joi.object().keys({
    order_id: Joi.string().required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().allow('').optional(),
  }),
};

// Routes
router.get(
  '/test',
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Payment routes working',
      razorpay_configured: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      razorpay_key_id: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 10) + '...' : 'Not set',
    });
  }
);

router.get(
  '/test-user',
  auth(),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'User data test',
      user: req.user,
      user_fields: {
        id: req.user?.id,
        name: req.user?.name,
        full_name: req.user?.full_name,
        username: req.user?.username,
        email: req.user?.email,
        user_email: req.user?.user_email,
        phone: req.user?.phone,
        mobile: req.user?.mobile,
        user_phone: req.user?.user_phone
      }
    });
  }
);

router.post(
  '/create-order',
  auth(),
  validate(createOrderValidation),
  catchAsync(paymentController.createOrder)
);

router.post(
  '/verify-payment',
  auth(),
  validate(verifyPaymentValidation),
  catchAsync(paymentController.verifyPayment)
);

router.get(
  '/user-orders',
  auth(),
  validate(getOrdersValidation),
  catchAsync(paymentController.getUserOrders)
);

router.get(
  '/vendor-orders',
  auth(),
  validate(getOrdersValidation),
  catchAsync(paymentController.getVendorOrders)
);

router.get(
  '/vendor-payment-history',
  auth(),
  validate(getOrdersValidation),
  catchAsync(paymentController.getVendorPaymentHistory)
);

router.put(
  '/cancel-order/:order_id',
  auth(),
  validate(cancelOrderValidation),
  catchAsync(paymentController.cancelOrder)
);

module.exports = router;