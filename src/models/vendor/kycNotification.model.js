const mongoose = require('mongoose');

const kycNotificationSchema = new mongoose.Schema(
  {
    vendor_id: { type: String, required: true, index: true },
    email: { type: String, required: true },
    kyc_id: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorKyc', required: true },
    notification_type: {
      type: String,
      enum: ['kyc_incomplete', 'admin_approval', 'admin_rejection'],
      required: true
    },
    reminder_stage: {
      type: String,
      enum: ['instant', '24h', '48h', 'weekly', 'monthly', 'yearly'],
      default: 'instant'
    },
    sent_at: { type: Date, default: Date.now },
    next_reminder_at: { type: Date },
    is_active: { type: Boolean, default: true },
    completed_steps: { type: Number, default: 0 },
    total_steps: { type: Number, default: 5 }
  },
  {
    timestamps: true,
  }
);

kycNotificationSchema.index({ vendor_id: 1, notification_type: 1 });
kycNotificationSchema.index({ next_reminder_at: 1, is_active: 1 });

const KycNotification = mongoose.model('KycNotification', kycNotificationSchema);
module.exports = KycNotification;