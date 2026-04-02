const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true,
  },
  otp: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    index: { expires: '10m' }, // TTL index for automatic deletion
  },
}, {
  timestamps: true,
});

const Otp = mongoose.model('Otp', otpSchema);

module.exports = Otp;
