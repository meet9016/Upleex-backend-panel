const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const priorityPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, index: true, trim: true }, // Priority Basic, Standard, Premium
    monthly_price: { type: Number, required: true },
    yearly_price: { type: Number, required: true },
    product_slots: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    addon_available_for_yearly: { type: Boolean, default: true },
    addon_price_per_year: { type: Number, default: 0 },
    addon_max_slots: { type: Number, default: 0 },
  },
  { timestamps: true }
);

priorityPlanSchema.plugin(toJSON);

const PriorityPlan = mongoose.model('PriorityPlan', priorityPlanSchema);
module.exports = PriorityPlan;

