const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['order_update', 'quote_update', 'payment_update', 'system', 'other'],
      default: 'other',
    },
    data: {
      type: Object,
      default: {},
    },
    is_read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.plugin(toJSON);

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
