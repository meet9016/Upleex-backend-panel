const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const listingPlanPurchaseSchema = new mongoose.Schema(
  {
    vendor_id: { type: String, required: true, index: true },
    plan_type: { type: String, required: true },
    months: { type: Number, required: true },
    max_products: { type: Number, required: true },
    amount: { type: Number, default: 0 },
    product_ids: { type: [String], default: [] },
    start_at: { type: Date, default: () => new Date() },
    expire_at: { type: Date },
  },
  { timestamps: true }
);

listingPlanPurchaseSchema.plugin(toJSON);

const ListingPlanPurchase = mongoose.model('ListingPlanPurchase', listingPlanPurchaseSchema);

module.exports = ListingPlanPurchase;
