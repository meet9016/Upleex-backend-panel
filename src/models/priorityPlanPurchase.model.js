const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const priorityPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    plan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PriorityPlan', required: true },
    plan_name: { type: String, required: true },
    amount: { type: Number, required: true },
    total_slots: { type: Number, required: true },
    product_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] },
    start_at: { type: Date, default: () => new Date() },
    expire_at: { type: Date, required: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  },
  { timestamps: true }
);

priorityPlanPurchaseSchema.plugin(toJSON);

const PriorityPlanPurchase = mongoose.model('PriorityPlanPurchase', priorityPlanPurchaseSchema);

module.exports = PriorityPlanPurchase;
