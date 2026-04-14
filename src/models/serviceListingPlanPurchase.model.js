const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const serviceListingPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ServicePlan', required: true },
    plan_name: { type: String, required: true },
    months: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    max_services: { type: Number, default: 0 },
    service_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'Service', default: [] },
    start_at: { type: Date, default: () => new Date() },
    expire_at: { type: Date },
  },
  { timestamps: true }
);

serviceListingPlanPurchaseSchema.plugin(toJSON);

const ServiceListingPlanPurchase = mongoose.model('ServiceListingPlanPurchase', serviceListingPlanPurchaseSchema);

module.exports = ServiceListingPlanPurchase;
