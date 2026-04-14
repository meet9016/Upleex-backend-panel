const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const servicePriorityPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePriorityPlan', required: true },
    plan_name: { type: String, required: true },
    months: { type: Number, required: true },
    amount: { type: Number, required: true },
    service_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'Service', default: [] },
    has_duration_addon: { type: Boolean, default: false },
    addon_amount: { type: Number, default: 0 },
    start_at: { type: Date, default: () => new Date() },
    expire_at: { type: Date },
  },
  { timestamps: true }
);

servicePriorityPlanPurchaseSchema.plugin(toJSON);

const ServicePriorityPlanPurchase = mongoose.model('ServicePriorityPlanPurchase', servicePriorityPlanPurchaseSchema);

module.exports = ServicePriorityPlanPurchase;
