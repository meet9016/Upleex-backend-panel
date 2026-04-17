const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const orderItemSchema = new mongoose.Schema(
  {
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    vendor_id: {
      type: String,
      required: true,
    },
    product_name: {
      type: String,
      required: true,
    },
    product_image: {
      type: String,
      default: '',
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    gst_amount: {
      type: Number,
      default: 0,
    },
    final_amount: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_id: {
      type: String,
      required: true,
      unique: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    user_name: {
      type: String,
      required: true,
    },
    user_email: {
      type: String,
      default: '',
    },
    user_phone: {
      type: String,
      default: '',
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    gst_amount: {
      type: Number,
      default: 0,
    },
    delivery_charges: {
      type: Number,
      default: 0,
    },
    installation_charges: {
      type: Number,
      default: 0,
    },
    deposit_amount: {
      type: Number,
      default: 0,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'hold', 'failed', 'refunded'],
      default: 'pending',
    },
    payment_method: {
      type: String,
      enum: ['razorpay', 'cod', 'wallet'],
      default: 'razorpay',
    },
    payment_type: {
      type: String,
      enum: ['full', '30_percent'],
      default: 'full',
    },
    razorpay_order_id: {
      type: String,
      default: '',
    },
    razorpay_payment_id: {
      type: String,
      default: '',
    },
    razorpay_signature: {
      type: String,
      default: '',
    },
    order_status: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'],
      default: 'pending',
    },
    vendor_status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'],
      default: 'pending',
    },
    delivery_tracking: {
      tracking_number: {
        type: String,
        default: '',
      },
      courier_partner: {
        type: String,
        default: '',
      },
      estimated_delivery: {
        type: Date,
      },
      delivery_updates: [{
        status: String,
        message: String,
        location: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        updated_by: {
          type: String,
          enum: ['vendor', 'admin', 'system'],
          default: 'system',
        },
      }],
    },
    order_notes: {
      type: String,
      default: '',
    },
    vendor_payments: [{
      vendor_id: String,
      vendor_amount: Number,
      payment_status: {
        type: String,
        enum: ['pending', 'paid', 'released', 'failed'],
        default: 'pending',
      },
      delivered_at: Date,
      release_date: Date,
      released_at: Date,
      paid_at: Date,
    }],
  },
  {
    timestamps: true,
  }
);

orderSchema.plugin(toJSON);

// Index for better query performance
orderSchema.index({ user_id: 1, createdAt: -1 });
orderSchema.index({ order_id: 1 });
orderSchema.index({ 'items.vendor_id': 1, createdAt: -1 });
orderSchema.index({ payment_status: 1, order_status: 1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;