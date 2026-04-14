const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const servicePlanSchema = new mongoose.Schema(
  {
    plan_name: { type: String, required: true, unique: true, index: true },
    months: { type: Number, required: true },
    amount: { type: Number, required: true },
    max_services: { type: Number, default: 0 }, // 0 for unlimited or specific limit
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

servicePlanSchema.plugin(toJSON);

const ServicePlan = mongoose.model('ServicePlan', servicePlanSchema);

module.exports = ServicePlan;
