const mongoose = require('mongoose');

const vendorNotificationSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: {
      type: String,
      enum: ['kyc_update', 'product_update', 'quote_request', 'order_request', 'payment_received', 'other', 'order_payment', 'quote_payment', 'payment_update'],
      default: 'other',
    },
    data: { type: Object, default: {} },
    is_read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VendorNotification', vendorNotificationSchema);
