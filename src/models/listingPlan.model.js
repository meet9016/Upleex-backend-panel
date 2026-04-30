const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const listingPlanSchema = new mongoose.Schema(
  {
    plan_type: { type: String, required: true, unique: true, index: true },
    months: { type: Number, required: true },
    max_products: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    popular: { type: Boolean, default: false },
    features: { type: [String], default: [] },
  },
  { timestamps: true }
);

listingPlanSchema.plugin(toJSON);

const ListingPlan = mongoose.model('ListingPlan', listingPlanSchema);

module.exports = ListingPlan;

