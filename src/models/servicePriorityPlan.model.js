const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const servicePriorityPlanSchema = new mongoose.Schema(
  {
    plan_name: { type: String, default: "Priority Plan" },
    monthly_price: { type: Number, required: true },
    yearly_price: { type: Number, required: true },
    addon_price: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    features: { type: [String], default: [] },
  },
  { timestamps: true }
);

servicePriorityPlanSchema.plugin(toJSON);

const ServicePriorityPlan = mongoose.model('ServicePriorityPlan', servicePriorityPlanSchema);

module.exports = ServicePriorityPlan;
