const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const serviceSchema = new mongoose.Schema(
  {
    service_name: {
      type: String,
      required: true,
      trim: true,
    },
    category_id: {
      type: String,
      required: true,
    },
    category_name: {
      type: String,
    },
    price: {
      type: String,
      required: true,
    },
    duration: {
      type: String,
    },
    description: {
      type: String,
    },
    image: {
      type: String,
    },
    vendor_id: {
      type: String,
      required: true,
    },
    vendor_name: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    approval_status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    billing_type: {
      type: String,
      enum: ['day', 'month', 'hourly'],
      default: 'day',
    },
    location: {
      type: String,
    },
    sub_images: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

serviceSchema.plugin(toJSON);

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
