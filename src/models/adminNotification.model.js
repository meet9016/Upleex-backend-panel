const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['new_vendor', 'product_request', 'service_request', 'payment', 'other'],
      default: 'other',
    },
    data: { type: Object, default: {} },
    is_read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AdminNotification', adminNotificationSchema);
