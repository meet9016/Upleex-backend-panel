const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const vendorPaymentSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    vendor_id: {
      type: String,
      required: true,
    },
    vendor_amount: {
      type: Number,
      required: true,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'released', 'failed', 'cancelled'],
      default: 'pending',
    },
    delivered_at: {
      type: Date,
      required: true,
    },
    release_date: {
      type: Date,
      required: true, // 7 days after delivered_at
    },
    released_at: {
      type: Date,
    },
    released_by: {
      type: String,
      enum: ['admin', 'system'],
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

vendorPaymentSchema.plugin(toJSON);

// Indexes
vendorPaymentSchema.index({ vendor_id: 1, createdAt: -1 });
vendorPaymentSchema.index({ payment_status: 1, release_date: 1 });
vendorPaymentSchema.index({ order_id: 1 });

const VendorPayment = mongoose.model('VendorPayment', vendorPaymentSchema);

module.exports = VendorPayment;