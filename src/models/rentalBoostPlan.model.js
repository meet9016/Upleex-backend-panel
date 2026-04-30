const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const rentalBoostPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: false, trim: true },
    days: { type: Number, required: true },
    price: { type: Number, required: true },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    is_popular: { type: Boolean, default: false },
    features: { type: [String], default: [] },
  },
  { timestamps: true }
);

rentalBoostPlanSchema.plugin(toJSON);

const RentalBoostPlan = mongoose.model('RentalBoostPlan', rentalBoostPlanSchema);
module.exports = RentalBoostPlan;
