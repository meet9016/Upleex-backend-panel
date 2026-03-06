const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const listingPlanSchema = new mongoose.Schema(
  {
    plan_type: { type: String, required: true, unique: true, index: true },
    months: { type: Number, required: true },
    max_products: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    description: { type: String, default: '' },
    popular: { type: Boolean, default: false },
  },
  { timestamps: true }
);

listingPlanSchema.plugin(toJSON);

const ListingPlan = mongoose.model('ListingPlan', listingPlanSchema);

module.exports = ListingPlan;

