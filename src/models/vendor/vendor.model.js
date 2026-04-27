const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const vendorSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
    trim: true,
  },
  business_name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  alternate_number: {
    type: String,
    trim: true,
  },
  country: {
    type: String,
    required: true,
    trim: true,
  },
  city_id: {
    type: String,
    trim: true,
  },
  otp: {
    type: String,
  },
  fcmTokens: {
    type: [String],
    default: [],
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  vendor_type: {
    type: String,
    enum: ['service', 'vendor', 'both'],
    default: 'both',
  },
}, {
  timestamps: true,
});

vendorSchema.methods.toJSON = function () {
  const vendor = this.toObject();
  delete vendor.otp;
  return vendor;
};

const Vendor = mongoose.model('Vendor', vendorSchema);
module.exports = Vendor;
