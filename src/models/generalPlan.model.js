const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const generalPlanSchema = new mongoose.Schema(
  {
    plan_type: { type: String, required: true, unique: true, index: true },
    max_products: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    popular: { type: Boolean, default: false },
    features: { type: [String], default: [] },
  },
  { timestamps: true }
);

generalPlanSchema.plugin(toJSON);

const GeneralPlan = mongoose.model('GeneralPlan', generalPlanSchema);

module.exports = GeneralPlan;
