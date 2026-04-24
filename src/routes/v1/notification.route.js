const express = require('express');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const Notification = require('../../models/notification.model');
const httpStatus = require('http-status');

const router = express.Router();

// Get user notifications
router.get('/', auth('user'), catchAsync(async (req, res) => {
  const notifications = await Notification.find({ user_id: req.user.id })
    .sort({ createdAt: -1 })
    .limit(50);
    
  res.status(httpStatus.OK).json({
    success: true,
    data: notifications
  });
}));

// Mark all as read — PEHLE DEFINE KARO
router.put('/read-all', auth('user'), catchAsync(async (req, res) => {
  await Notification.updateMany(
    { user_id: req.user.id, is_read: false },
    { is_read: true }
  );
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'All notifications marked as read'
  });
}));

// Mark single notification as read
router.put('/:id/read', auth('user'), catchAsync(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user.id },
    { is_read: true }
  );
  
  res.status(httpStatus.OK).json({
    success: true,
    message: 'Notification marked as read'
  });
}));

module.exports = router;
