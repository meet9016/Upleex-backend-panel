const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const activityLogSchema = new mongoose.Schema(
  {
    admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    actor_type: { type: String, enum: ['admin', 'vendor', 'system'], default: 'admin' },
    action: { type: String, required: true }, // e.g., LOGIN, CREATE, UPDATE, DELETE, APPROVE
    module: { type: String, required: true }, // e.g., Auth, Vendor, Product, Order
    description: { type: String, required: true }, // Detailed description of the action
    ip_address: { type: String }, // IP address
    metadata: { type: mongoose.Schema.Types.Mixed }, // Any additional info (e.g., entity ID, changes)
  },
  { timestamps: true }
);

activityLogSchema.plugin(toJSON);
activityLogSchema.plugin(paginate);

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
module.exports = ActivityLog;
