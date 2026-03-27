const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const listingPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    plan_type: { type: String, required: true },
    months: { type: Number, required: true },
    max_products: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    product_ids: { type: [mongoose.Schema.Types.ObjectId], ref: 'Product', default: [] },
    start_at: { type: Date, default: () => new Date() },
    expire_at: { type: Date },
  },
  { timestamps: true }
);

listingPlanPurchaseSchema.plugin(toJSON);

listingPlanPurchaseSchema.index({ plan_type: 1, amount: 1, start_at: 1, expire_at: 1 });

const ListingPlanPurchase = mongoose.model('ListingPlanPurchase', listingPlanPurchaseSchema);

module.exports = ListingPlanPurchase;
