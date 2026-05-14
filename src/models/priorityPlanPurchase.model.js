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
    plan_duration: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
    is_addon_purchased: { type: Boolean, default: false },
    addon_max_slots: { type: Number, default: 0 },
    addon_product_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] },
    // Legacy fields (for compatibility)
    is_unlimited: { type: Boolean, default: false },
    is_extra_per_product: { type: Boolean, default: false },
    // New 4 fields for duration-specific tracking
    is_monthly_extra: { type: Boolean, default: false },
    is_monthly_unlimited: { type: Boolean, default: false },
    is_yearly_extra: { type: Boolean, default: false },
    is_yearly_unlimited: { type: Boolean, default: false },
    // New field: free_listing (per purchase, default true)
    free_listing: { type: Boolean, default: true },
    gst_amount: { type: Number, default: 0 },
    total_amount: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  },
  { timestamps: true }
);

priorityPlanPurchaseSchema.plugin(toJSON);

const PriorityPlanPurchase = mongoose.model('PriorityPlanPurchase', priorityPlanPurchaseSchema);

module.exports = PriorityPlanPurchase;
