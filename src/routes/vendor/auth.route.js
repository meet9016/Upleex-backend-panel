const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/vendor/auth.validation');
const authController = require('../../controllers/vendor/auth.controller');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const Vendor = require('../../models/vendor/vendor.model');

const router = express.Router();

router.post(
  '/business-register',
  validate(authValidation.businessRegister),
  authController.businessRegister
);

router.post(
  '/vendor-login',
  validate(authValidation.vendorLogin),
  authController.vendorLogin
);

// Register FCM token for vendor
router.post('/register-fcm', auth('vendor'), catchAsync(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: 'Token required' });

  const vendor = await Vendor.findById(req.user.id);
  if (!vendor) return res.status(404).json({ success: false, message: 'Vendor not found' });

  if (!vendor.fcmTokens.includes(token)) {
    vendor.fcmTokens.push(token);
    await vendor.save();
  }

  res.status(200).json({ success: true, message: 'FCM token registered' });
}));

// Get vendor notifications
router.get('/notifications', auth('vendor'), catchAsync(async (req, res) => {
  const VendorNotification = require('../../models/vendorNotification.model');
  const notifications = await VendorNotification.find({ vendor_id: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.status(200).json({ success: true, data: notifications });
}));

// Mark all notifications as read — PEHLE define karo
router.put('/notifications/read-all', auth('vendor'), catchAsync(async (req, res) => {
  const VendorNotification = require('../../models/vendorNotification.model');
  await VendorNotification.updateMany({ vendor_id: req.user.id, is_read: false }, { is_read: true });
  res.status(200).json({ success: true });
}));

// Mark single notification as read
router.put('/notifications/:id/read', auth('vendor'), catchAsync(async (req, res) => {
  const VendorNotification = require('../../models/vendorNotification.model');
  await VendorNotification.findOneAndUpdate(
    { _id: req.params.id, vendor_id: req.user.id },
    { is_read: true }
  );
  res.status(200).json({ success: true });
}));

module.exports = router;
